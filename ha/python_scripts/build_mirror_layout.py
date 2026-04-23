# Smart Mirror — layout builder (HA python_script sandbox safe).
#
# HA python_script sandbox blocks `import` (including json, os, time) and
# file I/O. It exposes:
#   - hass       — the HA Core object (read states, call services, set states)
#   - data       — service-call data dict
#   - logger     — logger instance
#   - time_fired — iso timestamp of the invocation
#   - service_name — e.g. 'build_mirror_layout'
# Plus a few helpers: `now()` returns a datetime; basic builtins are allowed.
#
# This script stores the resolved layout as the attribute dict on
# `sensor.mirror_layout_file`. The frontend reads that attribute directly
# — no JSON serialization or disk writes are needed.

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


def _state(entity_id, default):
    s = hass.states.get(entity_id)
    return s.state if s is not None else default


# 1. Resolve inputs ---------------------------------------------------------
preset      = data.get('preset')      or _state('input_select.mirror_preset', 'auto')
mode        = data.get('mode')        or _state('input_select.mirror_mode', 'auto')
theme       = data.get('theme')       or _state('input_select.mirror_theme', 'auto')
orientation = data.get('orientation') or _state('input_select.mirror_orientation', 'portrait')
resolution  = _state('input_select.mirror_resolution', '1080p')

# 2. Preset -> (mode, theme) overlay ---------------------------------------
if preset and preset != 'auto' and preset in PRESETS:
    p_mode, p_theme = PRESETS[preset]
    if mode == 'auto':
        mode = p_mode
    if theme == 'auto':
        theme = p_theme

# 3. Auto-mode inference from context --------------------------------------
if mode == 'auto':
    _hour = now().hour
    _svc   = hass.states.get('binary_sensor.any_service_down')
    _guest = hass.states.get('input_boolean.guest_mode')
    _plex  = hass.states.get('binary_sensor.plex_playing')
    if _svc is not None and _svc.state == 'on':
        mode = 'ops'
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

# 5. Build a default layout -----------------------------------------------
# For Phase 02 we embed a basic 2-tile layout. Later phases route through
# the per-mode layout JSONs under ha/layouts/ — but loading those from
# disk needs a custom_component (sandbox forbids open()). Kept inline
# for now.
tiles = [
    {
        'id': 'clock',
        'type': 'clock',
        'x': 1, 'y': 1, 'w': 6, 'h': 3,
        'z': 0,
        'audio': False,
        'resizable': True,
        'props': {'format': '24h', 'showSeconds': True, 'showDate': True},
    },
    {
        'id': 'weather',
        'type': 'weather',
        'x': 1, 'y': 4, 'w': 6, 'h': 3,
        'z': 0,
        'audio': False,
        'resizable': True,
        'props': {'units': 'metric', 'days': 3},
    },
]

if orientation == 'portrait':
    grid_cfg = {'cols': 8, 'rows': 14, 'gap': 14}
else:
    grid_cfg = {'cols': 12, 'rows': 8, 'gap': 14}

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
# `layout` is stored as an attribute dict. The frontend reads it directly
# via state_attr('sensor.mirror_layout_file', 'layout') — no JSON string
# needed because HA serialises attributes itself.
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
        'layout': layout,
    },
)

logger.info(
    'mirror: built layout rev=%s mode=%s theme=%s orientation=%s',
    revision, mode, theme, orientation,
)
