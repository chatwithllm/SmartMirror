# Smart Mirror — apply a tile patch to the current layout.
# Data: tile_id (str, required), x/y/w/h (optional int).
# Reads sensor.mirror_layout_file.attributes.layout_json, merges the
# patch, and re-sets the attribute. The Phase 02 build_mirror_layout
# runs next to bump the revision.

import json

tile_id = data.get('tile_id')
if not tile_id:
    logger.warning('patch_mirror_layout: missing tile_id')
else:
    sensor = hass.states.get('sensor.mirror_layout_file')
    if sensor is None:
        logger.warning('patch_mirror_layout: no layout file sensor yet')
    else:
        raw = sensor.attributes.get('layout_json') or '{}'
        layout = json.loads(raw)
        for t in layout.get('tiles', []):
            if t.get('id') == tile_id:
                for k in ('x', 'y', 'w', 'h'):
                    v = data.get(k)
                    if v is not None:
                        t[k] = int(v)
        hass.states.set(
            'sensor.mirror_layout_file',
            sensor.state,
            {**sensor.attributes, 'layout_json': json.dumps(layout, separators=(',', ':'))},
        )
