# Smart Mirror — tile patch (HA python_script sandbox safe).
# Merges {tile_id, x, y, w, h} into the current layout attribute.

tile_id = data.get('tile_id')
if not tile_id:
    logger.warning('patch_mirror_layout: missing tile_id')
else:
    sensor = hass.states.get('sensor.mirror_layout_file')
    if sensor is None:
        logger.warning('patch_mirror_layout: no layout sensor yet; run build_mirror_layout first')
    else:
        attrs = dict(sensor.attributes)
        layout = attrs.get('layout')
        if not isinstance(layout, dict):
            logger.warning('patch_mirror_layout: layout attribute missing or malformed')
        else:
            tiles = layout.get('tiles', [])
            patched = []
            for t in tiles:
                if t.get('id') == tile_id:
                    t = dict(t)
                    for k in ('x', 'y', 'w', 'h'):
                        v = data.get(k)
                        if v is not None:
                            t[k] = int(v)
                patched.append(t)
            layout['tiles'] = patched
            attrs['layout'] = layout
            attrs['written_at'] = now().strftime('%Y-%m-%dT%H:%M:%S')
            hass.states.set('sensor.mirror_layout_file', int(now().timestamp()), attrs)
