# Smart Mirror — layout builder (HA python_script sandbox safe).
#
# Sandbox exposes only: hass, data, logger, service_name, time_fired.
# NO imports, NO now() helper, NO file I/O.
#
# Layout is stored as a dict attribute on `sensor.mirror_layout_file`.
# Frontend reads it via the HA REST /api/states endpoint.

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
# Without now(), we can't check the wall clock. Fall through to 'work' when
# nothing else matches — the 5-minute automation re-calls us so the
# eventual mode still flips correctly once HA sends state changes.
if mode == 'auto':
    _svc   = hass.states.get('binary_sensor.any_service_down')
    _guest = hass.states.get('input_boolean.guest_mode')
    _plex  = hass.states.get('binary_sensor.plex_playing')
    if _svc is not None and _svc.state == 'on':
        mode = 'ops'
    elif _guest is not None and _guest.state == 'on':
        mode = 'guest'
    elif _plex is not None and _plex.state == 'on':
        mode = 'relax'
    else:
        mode = 'work'

# 4. Theme coercion per COMPAT ---------------------------------------------
allowed_themes = COMPAT.get(mode, ['minimal-dark'])
if theme == 'auto' or theme not in allowed_themes:
    theme = allowed_themes[0]

# 5. Build a default layout -----------------------------------------------
tiles = [
    {
        'id': 'clock',
        'type': 'clock',
        'x': 0, 'y': 0, 'w': 4, 'h': 2,
        'z': 0,
        'audio': False,
        'resizable': True,
        'props': {'format': '24h', 'showSeconds': True, 'showDate': True},
    },
    {
        'id': 'weather',
        'type': 'weather',
        'x': 4, 'y': 0, 'w': 4, 'h': 2,
        'z': 0,
        'audio': False,
        'resizable': True,
        'props': {'units': 'metric', 'days': 3},
    },
    {
        'id': 'alerts',
        'type': 'alerts',
        'x': 0, 'y': 2, 'w': 8, 'h': 2,
        'z': 0,
        'audio': False,
        'resizable': True,
        'props': {'severity_min': 'warn'},
    },
    {
        'id': 'svc',
        'type': 'service_status',
        'x': 0, 'y': 4, 'w': 4, 'h': 3,
        'z': 0,
        'audio': False,
        'resizable': True,
        'props': {},
    },
    {
        'id': 'hosts',
        'type': 'host_health',
        'x': 4, 'y': 4, 'w': 4, 'h': 3,
        'z': 0,
        'audio': False,
        'resizable': True,
        'props': {},
    },
    {
        'id': 'cal',
        'type': 'calendar',
        'x': 0, 'y': 7, 'w': 8, 'h': 3,
        'z': 0,
        'audio': False,
        'resizable': True,
        'props': {'count': 5},
    },
    {
        'id': 'news',
        'type': 'news_briefing',
        'x': 0, 'y': 10, 'w': 8, 'h': 2,
        'z': 0,
        'audio': False,
        'resizable': True,
        'props': {'count': 5},
    },
    {
        'id': 'board',
        'type': 'project_board',
        'x': 0, 'y': 12, 'w': 8, 'h': 2,
        'z': 0,
        'audio': False,
        'resizable': True,
        'props': {},
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
# Use a monotonic counter seeded from the previous state — sandbox has no
# clock helpers on this HA version.
prev = hass.states.get('sensor.mirror_layout_file')
try:
    revision = int(prev.state) + 1
except Exception:
    revision = 1

hass.states.set(
    'sensor.mirror_layout_file',
    revision,
    {
        'revision': revision,
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
