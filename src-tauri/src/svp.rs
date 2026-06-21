use std::path::{Path, PathBuf};
use tauri::Manager;

#[derive(serde::Serialize)]
pub struct SvpStatus {
    installed: bool,
    ready: bool,
}

fn svp_root() -> Option<PathBuf> {
    let mut cands = vec![
        PathBuf::from("C:\\Program Files (x86)\\SVP 4"),
        PathBuf::from("C:\\Program Files\\SVP 4"),
    ];
    for env in ["ProgramFiles", "ProgramFiles(x86)", "LOCALAPPDATA"] {
        if let Ok(p) = std::env::var(env) {
            cands.push(PathBuf::from(&p).join("SVP 4"));
            cands.push(PathBuf::from(&p).join("Programs").join("SVP 4"));
        }
    }
    cands.into_iter().find(|d| d.join("SVPManager.exe").exists())
}

fn find_file_dir(root: &Path, names: &[&str], depth: u32) -> Option<PathBuf> {
    if depth == 0 {
        return None;
    }
    let entries = std::fs::read_dir(root).ok()?;
    let mut subdirs = Vec::new();
    for e in entries.flatten() {
        let p = e.path();
        if p.is_dir() {
            subdirs.push(p);
        } else if let Some(n) = p.file_name() {
            let n = n.to_string_lossy();
            if names.iter().any(|t| n.eq_ignore_ascii_case(t)) {
                return Some(root.to_path_buf());
            }
        }
    }
    for d in subdirs {
        if let Some(found) = find_file_dir(&d, names, depth - 1) {
            return Some(found);
        }
    }
    None
}

fn svpflow_dir(root: &Path) -> Option<PathBuf> {
    find_file_dir(root, &["svpflow1_vs.dll", "svpflow1_vs64.dll"], 5)
}

fn vsscript_dir(root: &Path) -> Option<PathBuf> {
    find_file_dir(root, &["VSScript.dll"], 5)
}

#[tauri::command]
pub fn svp_status() -> SvpStatus {
    let root = svp_root();
    let ready = root
        .as_ref()
        .map_or(false, |r| svpflow_dir(r).is_some() && vsscript_dir(r).is_some());
    SvpStatus {
        installed: root.is_some(),
        ready,
    }
}

#[tauri::command]
pub fn svp_launch() -> Result<(), String> {
    let root = svp_root().ok_or_else(|| "SVP Manager is not installed".to_string())?;
    let exe = root.join("SVPManager.exe");
    std::process::Command::new(&exe)
        .current_dir(&root)
        .spawn()
        .map_err(|e| format!("launch SVP Manager: {}", e))?;
    Ok(())
}

const VPY_TEMPLATE: &str = r#"import vapoursynth as vs
import os
from fractions import Fraction
core = vs.core

def _load(name):
    base = r"__DIR__"
    for n in (name, name.replace("_vs", "_vs64")):
        p = os.path.join(base, n)
        if os.path.exists(p):
            core.std.LoadPlugin(p)
            return
_load("svpflow1_vs.dll")
_load("svpflow2_vs.dll")

clip = video_in
src = container_fps if container_fps and container_fps > 1 else 23.976

target = __TARGET__
if target == -1:
    target = src * 2
elif target <= 0:
    target = display_fps if display_fps and display_fps > src else src * 2
if target < src:
    target = src

fr = Fraction(target / src).limit_denominator(1000)
num, den = fr.numerator, fr.denominator

sup = core.svp1.Super(clip, "{gpu:1}")
vec = core.svp1.Analyse(sup["clip"], sup["data"], clip, "{}")
smooth = core.svp2.SmoothFps(clip, sup["clip"], sup["data"], vec["clip"], vec["data"],
    "{rate:{num:%d,den:%d},algo:13,mask:{cover:80}}" % (num, den), src=clip, fps=src)
smooth = core.std.AssumeFPS(smooth, fpsnum=int(round(src * num / den * 1000)), fpsden=1000)
smooth.set_output()
"#;

#[tauri::command]
pub fn svp_apply(app: tauri::AppHandle, target_fps: String) -> Result<String, String> {
    let root = svp_root().ok_or_else(|| "SVP is not installed".to_string())?;
    let flow = svpflow_dir(&root).ok_or_else(|| "svpflow plugins not found in the SVP install".to_string())?;
    let vs = vsscript_dir(&root)
        .ok_or_else(|| "VapourSynth (VSScript.dll) not found in the SVP install".to_string())?;

    let vs_str = vs.to_string_lossy().into_owned();
    let current = std::env::var("PATH").unwrap_or_default();
    if !current.split(';').any(|p| p.eq_ignore_ascii_case(&vs_str)) {
        std::env::set_var("PATH", format!("{};{}", vs_str, current));
    }

    let out_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("svp");
    std::fs::create_dir_all(&out_dir).map_err(|e| format!("create dir: {}", e))?;
    let target = match target_fps.as_str() {
        "double" => "-1",
        "48" => "48",
        "60" => "60",
        _ => "0",
    };
    let script = VPY_TEMPLATE
        .replace("__DIR__", flow.to_string_lossy().trim_end_matches('\\'))
        .replace("__TARGET__", target);
    let vpy = out_dir.join("svp.vpy");
    std::fs::write(&vpy, script).map_err(|e| format!("write vpy: {}", e))?;
    Ok(vpy.to_string_lossy().into_owned())
}
