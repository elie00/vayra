//! Whether Windows Defender Firewall lets peers reach the engine. The port status only
//! hears from the router; on Windows the firewall drops incoming connections first
//! unless a rule lets VAYRA in, so a forwarded port can still be unreachable.

// Only Windows reads a firewall; elsewhere the verdict is always None.
#[cfg_attr(not(windows), allow(dead_code))]
#[derive(Clone, Copy, Debug, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum Firewall {
    /// Incoming connections reach VAYRA: firewall off, inbound allowed, or a rule allows VAYRA.
    Open,
    /// "Block all incoming connections" is on.
    BlocksAll,
    /// A rule blocks VAYRA.
    Blocked,
    /// Group Policy runs the firewall and blocks inbound by default. Its rules cannot
    /// be read from here, and the local rules it ignores cannot fix it.
    Managed,
    /// Inbound is blocked by default and no rule lets VAYRA in yet.
    NoRule,
}

/// One active network profile, as the firewall reports it.
#[cfg(any(windows, test))]
#[derive(Clone, Copy, Debug)]
pub struct Profile {
    pub enabled: bool,
    pub inbound_allowed: bool,
    pub block_all: bool,
}

/// What an enabled inbound rule for VAYRA's executable does.
#[cfg(any(windows, test))]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum RuleAction {
    Allow,
    Block,
}

/// The firewall's answer for VAYRA, from the active profiles and the rules naming its
/// executable. A block rule wins over an allow rule, as in Windows Firewall itself.
#[cfg(any(windows, test))]
pub fn verdict(profiles: &[Profile], group_policy: bool, rules: &[RuleAction]) -> Firewall {
    let enabled: Vec<&Profile> = profiles.iter().filter(|p| p.enabled).collect();
    if enabled.is_empty() {
        return Firewall::Open;
    }
    if enabled.iter().any(|p| p.block_all) {
        return Firewall::BlocksAll;
    }
    if rules.contains(&RuleAction::Block) {
        return Firewall::Blocked;
    }
    if enabled.iter().all(|p| p.inbound_allowed) || rules.contains(&RuleAction::Allow) {
        return Firewall::Open;
    }
    if group_policy {
        Firewall::Managed
    } else {
        Firewall::NoRule
    }
}

/// Reads the firewall policy through COM; None where there is no Windows Firewall
/// or when it cannot be read.
#[cfg(windows)]
pub fn read() -> Option<Firewall> {
    use windows::Win32::NetworkManagement::WindowsFirewall::*;
    use windows::Win32::System::Com::{
        CoCreateInstance, CoInitializeEx, CoUninitialize, CLSCTX_INPROC_SERVER, COINIT_MULTITHREADED,
    };

    struct ComGuard(bool);
    impl Drop for ComGuard {
        fn drop(&mut self) {
            if self.0 {
                unsafe { CoUninitialize() };
            }
        }
    }
    // A thread already in another apartment can still make the calls; it just must not
    // be uninitialised here.
    let _com = ComGuard(unsafe { CoInitializeEx(None, COINIT_MULTITHREADED) }.is_ok());

    let policy: INetFwPolicy2 = unsafe { CoCreateInstance(&NetFwPolicy2, None, CLSCTX_INPROC_SERVER) }.ok()?;
    let types = unsafe { policy.CurrentProfileTypes() }.ok()?;
    let mut profiles = Vec::new();
    for kind in [NET_FW_PROFILE2_DOMAIN, NET_FW_PROFILE2_PRIVATE, NET_FW_PROFILE2_PUBLIC] {
        if types & kind.0 == 0 {
            continue;
        }
        unsafe {
            profiles.push(Profile {
                enabled: policy.get_FirewallEnabled(kind).ok()?.as_bool(),
                inbound_allowed: policy.get_DefaultInboundAction(kind).ok()? == NET_FW_ACTION_ALLOW,
                block_all: policy.get_BlockAllInboundTraffic(kind).ok()?.as_bool(),
            });
        }
    }
    let group_policy = unsafe { policy.LocalPolicyModifyState() }.ok()? != NET_FW_MODIFY_STATE_OK;
    let exe = std::env::current_exe().ok()?;
    let rules = rules_for(&policy, &exe.to_string_lossy(), types).unwrap_or_default();
    Some(verdict(&profiles, group_policy, &rules))
}

/// The enabled inbound TCP rules that name `exe` on an active profile.
#[cfg(windows)]
fn rules_for(
    policy: &windows::Win32::NetworkManagement::WindowsFirewall::INetFwPolicy2,
    exe: &str,
    active_profiles: i32,
) -> Option<Vec<RuleAction>> {
    use windows::core::Interface;
    use windows::Win32::NetworkManagement::WindowsFirewall::*;
    use windows::Win32::System::Ole::IEnumVARIANT;
    use windows::Win32::System::Variant::{VARIANT, VT_DISPATCH};

    const TCP: i32 = 6;
    let all = unsafe { policy.Rules().ok()?._NewEnum().ok()? }.cast::<IEnumVARIANT>().ok()?;
    let mut found = Vec::new();
    loop {
        let mut item = [VARIANT::default()];
        let mut fetched = 0u32;
        if unsafe { all.Next(&mut item, &mut fetched) }.is_err() || fetched == 0 {
            break;
        }
        let dispatch = unsafe {
            let v = &item[0].Anonymous.Anonymous;
            if v.vt != VT_DISPATCH {
                continue;
            }
            (*v.Anonymous.pdispVal).clone()
        };
        let Some(rule) = dispatch.and_then(|d| d.cast::<INetFwRule>().ok()) else { continue };
        let applies = unsafe {
            rule.Enabled().is_ok_and(|e| e.as_bool())
                && rule.Direction().is_ok_and(|d| d == NET_FW_RULE_DIR_IN)
                && rule.Profiles().is_ok_and(|p| p & active_profiles != 0)
                && rule.Protocol().is_ok_and(|p| p == TCP || p == NET_FW_IP_PROTOCOL_ANY.0)
                && rule.ApplicationName().is_ok_and(|a| a.to_string().eq_ignore_ascii_case(exe))
        };
        if !applies {
            continue;
        }
        match unsafe { rule.Action() } {
            Ok(NET_FW_ACTION_ALLOW) => found.push(RuleAction::Allow),
            Ok(NET_FW_ACTION_BLOCK) => found.push(RuleAction::Block),
            _ => {}
        }
    }
    Some(found)
}

#[cfg(not(windows))]
pub fn read() -> Option<Firewall> {
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    const BLOCKING: Profile = Profile { enabled: true, inbound_allowed: false, block_all: false };
    const ALLOWING: Profile = Profile { enabled: true, inbound_allowed: true, block_all: false };
    const OFF: Profile = Profile { enabled: false, inbound_allowed: false, block_all: false };

    #[test]
    fn a_firewall_that_is_off_or_lets_inbound_in_is_open() {
        assert_eq!(verdict(&[OFF], false, &[]), Firewall::Open);
        assert_eq!(verdict(&[ALLOWING], true, &[]), Firewall::Open);
        assert_eq!(verdict(&[], false, &[]), Firewall::Open);
    }

    #[test]
    fn an_allow_rule_lets_vayra_in_unless_a_block_rule_also_names_it() {
        assert_eq!(verdict(&[BLOCKING], false, &[RuleAction::Allow]), Firewall::Open);
        assert_eq!(verdict(&[BLOCKING], false, &[RuleAction::Allow, RuleAction::Block]), Firewall::Blocked);
        assert_eq!(verdict(&[ALLOWING], false, &[RuleAction::Block]), Firewall::Blocked);
    }

    #[test]
    fn block_all_beats_every_rule() {
        let shut = Profile { block_all: true, ..BLOCKING };
        assert_eq!(verdict(&[ALLOWING, shut], false, &[RuleAction::Allow]), Firewall::BlocksAll);
    }

    #[test]
    fn without_a_rule_the_default_block_decides() {
        assert_eq!(verdict(&[BLOCKING], false, &[]), Firewall::NoRule);
        // A managed work PC: domain and public profiles active, both blocking.
        assert_eq!(verdict(&[BLOCKING, BLOCKING], true, &[]), Firewall::Managed);
        // One active network still blocking is enough to lose its peers.
        assert_eq!(verdict(&[ALLOWING, BLOCKING], false, &[]), Firewall::NoRule);
    }

    #[cfg(windows)]
    #[test]
    fn reads_this_machine_firewall() {
        // Whatever the machine's settings, the policy must be readable.
        assert!(read().is_some());
    }
}
