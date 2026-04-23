# Smart Mirror — layout builder (Phase 02 stub, spec: BACKEND_SPEC.md §4)
#
# Invoked as `python_script.build_mirror_layout` from the HA event loop.
# Inputs (service data, all optional):
#   - preset: one of input_select.mirror_preset options, or 'auto'
#   - mode:   one of input_select.mirror_mode   options, or 'auto'
#   - theme:  one of input_select.mirror_theme  options, or 'auto'
#   - orientation: portrait | landscape
#
# Side effects:
#   - writes /config/www/mirror/layout.json (minified, atomic-ish)
#   - sets sensor.mirror_layout_file state to the new revision (int epoch)
#     with attributes: revision, written_at, mode, theme
#
# Constraints imposed by HA's python_script sandbox:
#   - no function definitions (no `def`)
#   - no imports beyond pre-provided (time, datetime, logger, hass, data)
#   - no subprocess / os beyond whatever HA whitelists
#
# This file intentionally keeps logic linear so the sandbox accepts it.

import json  # noqa: F401  (ignored by sandbox but tools may import)

PRESETS = {
    'morning-minimal':    ('morning',  'minimal-dark'),
    'morning-editorial':  ('morning',  'editorial'),
    'work-ops':           ('work',     'ops-cyberpunk'),
    'work-minimal':       ('work',     'minimal-dark'),
    'relax-minimal':      ('relax',    'minimal-dark'),
    'relax-editorial':    ('relax',    'editorial'),
    'shopping-minimal':   ('shopping', 'minimal-dark'),
    'shopping-ops':       ('shopping', 'ops-cyberpunk'),
    'security-security':  ('security', 'security'),
    'security-ops':       ('security', 'ops-cyberpunk'),
    'night-minimal':      ('night',    'minimal-dark'),
    'night-security':     ('night',    'security'),
    'ops-ops':            ('ops',      'ops-cyberpunk'),
    'guest-editorial':    ('guest',    'editorial'),
    'showcase-editorial': ('showcase', 'editorial'),
}

COMPAT = {
    'morning':   ['minimal-dark', 'editorial', 'ops-cyberpunk'],
    'work':      ['ops-cyberpunk', 'minimal-dark', 'editorial'],
    'relax':     ['minimal-dark', 'editorial'],
    'shopping':  ['minimal-dark', 'ops-cyberpunk', 'editorial'],
    'security':  ['security', 'ops-cyberpunk'],
    'night':     ['minimal-dark', 'security'],
    'ops':       ['ops-cyberpunk', 'security'],
    'guest':     ['editorial', 'minimal-dark'],
    'showcase':  ['editorial', 'minimal-dark'],
    'editorial': ['editorial'],
}

# 1. Resolve inputs ---------------------------------------------------------
preset = data.get('preset')
if not preset:
    _s = hass.states.get('input_select.mirror_preset')
    preset = _s.state if _s is not None else 'auto'

mode = data.get('mode')
if not mode:
    _s = hass.states.get('input_select.mirror_mode')
    mode = _s.state if _s is not None else 'auto'

theme = data.get('theme')
if not theme:
    _s = hass.states.get('input_select.mirror_theme')
    theme = _s.state if _s is not None else 'auto'

orientation = data.get('orientation')
if not orientation:
    _s = hass.states.get('input_select.mirror_orientation')
    orientation = _s.state if _s is not None else 'portrait'

resolution_state = hass.states.get('input_select.mirror_resolution')
resolution = resolution_state.state if resolution_state is not None else '1080p'

# 2. Preset -> (mode, theme) overlay ---------------------------------------
if preset and preset != 'auto' and preset in PRESETS:
    p_mode, p_theme = PRESETS[preset]
    if mode == 'auto':
        mode = p_mode
    if theme == 'auto':
        theme = p_theme

# 3. Auto-mode inference from context --------------------------------------
if mode == 'auto':
    _hour = int(now().strftime('%H'))
    _svc = hass.states.get('binary_sensor.any_service_down')
    _party = hass.states.get('input_boolean.party_mode')
    _guest = hass.states.get('input_boolean.guest_mode')
    _plex = hass.states.get('binary_sensor.plex_playing')
    if _svc is not None and _svc.state == 'on':
        mode = 'ops'
    elif _party is not None and _party.state == 'on':
        mode = 'showcase'
    elif _guest is not None and _guest.state == 'on':
        mode = 'guest'
    elif _plex is not None and _plex.state == 'on':
        mode = 'relax'
    elif _hour < 6 or _hour >= 22:
        mode = 'night'
    elif _hour < 10:
        mode = 'morning'
    elif _hour < 17:
        mode = 'work'
    else:
        mode = 'relax'

# 4. Theme coercion per COMPAT ---------------------------------------------
allowed_themes = COMPAT.get(mode, ['minimal-dark'])
if theme == 'auto' or theme not in allowed_themes:
    theme = allowed_themes[0]

# 5. Load per-mode layout template -----------------------------------------
# HA python_script sandbox has no `open()`, so we embed a minimal default
# here and rely on future phases (03+) to ship richer templates served from
# HA's /config/ha/layouts/ via a custom integration. For Phase 02 the goal
# is a *valid* layout + bumped revision sensor; content density grows later.

tiles = [
    {
        'id': 'clock',
        'type': 'clock',
        'x': 1, 'y': 1, 'w': 6, 'h': 4,
        'props': {'format': '24h', 'showSeconds': True, 'showDate': True},
    },
    {
        'id': 'weather',
        'type': 'weather',
        'x': 1, 'y': 6, 'w': 6, 'h': 3,
        'props': {'units': 'metric', 'days': 3},
    },
]

grid_cfg = {'cols': 8, 'rows': 14, 'gap': 14} if orientation == 'portrait' else {'cols': 12, 'rows': 8, 'gap': 14}

layout = {
    'version': 1,
    'mode': mode,
    'theme': theme,
    'orientation': orientation,
    'resolution': resolution,
    'transition': 'flip',
    'grid': grid_cfg,
    'tiles': tiles,
}

# 6. Revision bump + sensor update -----------------------------------------
# HA python_script sandbox blocks file I/O, so we bump the revision sensor
# and let a shell_command / notify handler persist JSON to www/mirror/.
# Phase 03 replaces this with a proper AppDaemon or native integration.

revision = int(now().timestamp())
written_at = now().strftime('%Y-%m-%dT%H:%M:%S')
hass.states.set(
    'sensor.mirror_layout_file',
    revision,
    {
        'revision': revision,
        'written_at': written_at,
        'mode': mode,
        'theme': theme,
        'orientation': orientation,
        'resolution': resolution,
        'layout_json': json.dumps(layout, separators=(',', ':')),
    },
)

logger.info(
    'mirror: built layout rev=%s mode=%s theme=%s orientation=%s',
    revision, mode, theme, orientation,
)
