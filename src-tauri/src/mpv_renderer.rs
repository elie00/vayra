//! mpv render context that keeps the player it draws alive.

use libmpv2::render::{RenderContext, RenderParam};
use libmpv2::Mpv;
use std::ops::{Deref, DerefMut};
use std::sync::Arc;

/// Since libmpv2 6 a render context borrows its player. Ours live in long-lived
/// slots, so this one holds a reference to the player instead and frees the
/// context before letting the player go.
pub struct Renderer {
    // Fields drop in declaration order: the context before the player.
    context: RenderContext<'static>,
    _mpv: Arc<Mpv>,
}

impl Renderer {
    pub fn new(mpv: Arc<Mpv>, params: Vec<RenderParam<()>>) -> Result<Self, String> {
        let context = mpv
            .create_render_context(params)
            .map_err(|e| format!("render init: {:?}", e))?;
        // SAFETY: `context` borrows `*mpv`, which the Arc stored beside it keeps
        // alive until after the context is dropped.
        let context = unsafe { std::mem::transmute::<RenderContext<'_>, RenderContext<'static>>(context) };
        Ok(Self { context, _mpv: mpv })
    }
}

impl Deref for Renderer {
    type Target = RenderContext<'static>;

    fn deref(&self) -> &Self::Target {
        &self.context
    }
}

impl DerefMut for Renderer {
    fn deref_mut(&mut self) -> &mut Self::Target {
        &mut self.context
    }
}
