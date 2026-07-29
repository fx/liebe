/**
 * `HassEntity` factories, one per domain Liebe currently supports.
 *
 * Shared infrastructure: the Storybook preview seeds the entity store with
 * these, and the Vitest suite is expected to migrate onto them over time so
 * stories and unit tests converge on a single mock shape (see
 * docs/specs/storybook/index.md, "Entity data mocking"). Excluded from coverage
 * scope — this is development tooling, not product code.
 */
import type { EntityAttributes, HassEntity } from '~/store/entityTypes'

/** Frozen timestamp so fixtures are deterministic across renders and snapshots. */
export const FIXTURE_TIMESTAMP = '2026-07-25T12:00:00.000Z'

export interface EntityOverrides {
  entity_id?: string
  state?: string
  attributes?: EntityAttributes
  last_changed?: string
  last_updated?: string
  context?: HassEntity['context']
}

/**
 * Build an entity from a domain default plus overrides. `attributes` is merged
 * shallowly onto the domain defaults, so a story can change one attribute
 * without restating the rest.
 */
function buildEntity(base: HassEntity, overrides: EntityOverrides = {}): HassEntity {
  const { attributes, ...rest } = overrides
  return {
    ...base,
    ...rest,
    attributes: { ...base.attributes, ...attributes },
  }
}

function entity(
  entityId: string,
  state: string,
  attributes: EntityAttributes,
  overrides: EntityOverrides = {}
): HassEntity {
  return buildEntity(
    {
      entity_id: entityId,
      state,
      attributes,
      last_changed: FIXTURE_TIMESTAMP,
      last_updated: FIXTURE_TIMESTAMP,
      context: { id: 'fixture-context', parent_id: null, user_id: null },
    },
    overrides
  )
}

export function createLightEntity(overrides: EntityOverrides = {}): HassEntity {
  return entity(
    'light.living_room',
    'on',
    {
      friendly_name: 'Living Room',
      brightness: 204,
      color_mode: 'brightness',
      supported_color_modes: ['brightness'],
      supported_features: 0,
    },
    overrides
  )
}

export function createSwitchEntity(overrides: EntityOverrides = {}): HassEntity {
  return entity(
    'switch.coffee_machine',
    'off',
    { friendly_name: 'Coffee Machine', device_class: 'outlet' },
    overrides
  )
}

export function createClimateEntity(overrides: EntityOverrides = {}): HassEntity {
  return entity(
    'climate.hallway',
    'heat',
    {
      friendly_name: 'Hallway Thermostat',
      current_temperature: 19.5,
      temperature: 21,
      min_temp: 7,
      max_temp: 35,
      target_temp_step: 0.5,
      temperature_unit: '°C',
      current_humidity: 44,
      hvac_modes: ['off', 'heat', 'cool', 'heat_cool', 'auto'],
      hvac_action: 'heating',
      fan_modes: ['auto', 'low', 'high'],
      fan_mode: 'auto',
      preset_modes: ['home', 'away', 'eco'],
      preset_mode: 'home',
      // SUPPORT_TARGET_TEMPERATURE | SUPPORT_TARGET_TEMPERATURE_RANGE
      supported_features: 3,
    },
    overrides
  )
}

export function createSensorEntity(overrides: EntityOverrides = {}): HassEntity {
  return entity(
    'sensor.living_room_temperature',
    '21.4',
    {
      friendly_name: 'Living Room Temperature',
      device_class: 'temperature',
      state_class: 'measurement',
      unit_of_measurement: '°C',
    },
    overrides
  )
}

export function createBinarySensorEntity(overrides: EntityOverrides = {}): HassEntity {
  return entity(
    'binary_sensor.front_door',
    'off',
    { friendly_name: 'Front Door', device_class: 'door' },
    overrides
  )
}

export function createCoverEntity(overrides: EntityOverrides = {}): HassEntity {
  return entity(
    'cover.living_room_blinds',
    'open',
    {
      friendly_name: 'Living Room Blinds',
      device_class: 'blind',
      current_position: 70,
      current_tilt_position: 40,
      // OPEN | CLOSE | SET_POSITION | STOP | OPEN_TILT | CLOSE_TILT | SET_TILT_POSITION | STOP_TILT
      supported_features: 255,
    },
    overrides
  )
}

export function createFanEntity(overrides: EntityOverrides = {}): HassEntity {
  return entity(
    'fan.bedroom',
    'on',
    {
      friendly_name: 'Bedroom Fan',
      percentage: 66,
      percentage_step: 33.333333,
      preset_modes: ['auto', 'sleep', 'boost'],
      preset_mode: 'auto',
      oscillating: false,
      direction: 'forward',
      // SET_SPEED | OSCILLATE | DIRECTION
      supported_features: 7,
    },
    overrides
  )
}

export function createCameraEntity(overrides: EntityOverrides = {}): HassEntity {
  return entity(
    'camera.driveway',
    'idle',
    {
      friendly_name: 'Driveway',
      entity_picture: '/api/camera_proxy/camera.driveway',
      frontend_stream_type: 'hls',
      // SUPPORT_STREAM
      supported_features: 2,
    },
    overrides
  )
}

/**
 * A full-featured speaker, mid-track — the media player card's default fixture.
 *
 * `supported_features` is 19903: PAUSE 1 | SEEK 2 | VOLUME_SET 4 | VOLUME_MUTE 8
 * | PREVIOUS_TRACK 16 | NEXT_TRACK 32 | TURN_ON 128 | TURN_OFF 256 |
 * VOLUME_STEP 1024 | SELECT_SOURCE 2048 | PLAY 16384 — every bit this card's
 * option surface gates on, plus TURN_OFF, which no gate reads but which a device
 * advertising TURN_ON always publishes alongside it.
 *
 * A literal here and a **sum of named `MEDIA_PLAYER_FEATURE` members** in
 * `MediaPlayerCard/__tests__/features.test.ts`, which pins the two against each
 * other. That way round on purpose: a fixture that computed the mask from the
 * constants it is used to test would agree with them however wrong they were,
 * which is the failure that file's docblock was written about.
 *
 * It was 19511 until the pinning test existed — TURN_ON, TURN_OFF and
 * VOLUME_MUTE clear while this comment claimed them — and the `Off` story, which
 * takes the fixture unmodified, asserted a `Turn on` button the card could not
 * render. Storybook's play functions run in neither `npm test` nor CI, so
 * nothing said so.
 *
 * The three narrower shapes the gating tests and stories need — play/pause only,
 * step-only volume, a receiver with no track — are built from this by overriding
 * `supported_features` at the call site, so there is one place the realistic
 * attribute set is written down.
 */
export function createMediaPlayerEntity(overrides: EntityOverrides = {}): HassEntity {
  return entity(
    'media_player.living_room_speaker',
    'playing',
    {
      friendly_name: 'Living Room Speaker',
      media_title: 'Espresso Bongo',
      media_artist: 'Jimmy Smith',
      app_name: 'Spotify',
      // Relative and HA-proxied, which is the common shape; integrations that
      // flag artwork remotely accessible publish an absolute URL instead.
      entity_picture: '/api/media_player_proxy/media_player.living_room_speaker',
      volume_level: 0.42,
      is_volume_muted: false,
      source: 'Spotify',
      source_list: ['Spotify', 'Radio', 'TV', 'Bluetooth'],
      media_position: 37,
      media_position_updated_at: FIXTURE_TIMESTAMP,
      media_duration: 254,
      group_members: [],
      supported_features: 19903,
    },
    overrides
  )
}

export function createWeatherEntity(overrides: EntityOverrides = {}): HassEntity {
  return entity(
    'weather.home',
    'partlycloudy',
    {
      friendly_name: 'Home',
      temperature: 22.3,
      temperature_unit: '°C',
      humidity: 51,
      pressure: 1014,
      pressure_unit: 'hPa',
      wind_speed: 11.5,
      wind_speed_unit: 'km/h',
      wind_bearing: 220,
      visibility: 16,
      visibility_unit: 'km',
      forecast: [
        { datetime: '2026-07-26T12:00:00+00:00', condition: 'sunny', temperature: 26, templow: 15 },
        { datetime: '2026-07-27T12:00:00+00:00', condition: 'rainy', temperature: 19, templow: 13 },
        {
          datetime: '2026-07-28T12:00:00+00:00',
          condition: 'cloudy',
          temperature: 21,
          templow: 14,
        },
      ],
    },
    overrides
  )
}

export function createInputBooleanEntity(overrides: EntityOverrides = {}): HassEntity {
  return entity(
    'input_boolean.guest_mode',
    'off',
    { friendly_name: 'Guest Mode', editable: true },
    overrides
  )
}

export function createInputNumberEntity(overrides: EntityOverrides = {}): HassEntity {
  return entity(
    'input_number.target_humidity',
    '45',
    {
      friendly_name: 'Target Humidity',
      min: 0,
      max: 100,
      step: 1,
      mode: 'slider',
      unit_of_measurement: '%',
      editable: true,
    },
    overrides
  )
}

export function createInputSelectEntity(overrides: EntityOverrides = {}): HassEntity {
  return entity(
    'input_select.house_mode',
    'Home',
    {
      friendly_name: 'House Mode',
      options: ['Home', 'Away', 'Night', 'Vacation'],
      editable: true,
    },
    overrides
  )
}

export function createInputTextEntity(overrides: EntityOverrides = {}): HassEntity {
  return entity(
    'input_text.doorbell_message',
    'Please leave parcels at the side door',
    { friendly_name: 'Doorbell Message', min: 0, max: 255, mode: 'text', editable: true },
    overrides
  )
}

export function createInputDateTimeEntity(overrides: EntityOverrides = {}): HassEntity {
  return entity(
    'input_datetime.wake_up',
    '2026-07-26 06:30:00',
    {
      friendly_name: 'Wake Up',
      has_date: true,
      has_time: true,
      year: 2026,
      month: 7,
      day: 26,
      hour: 6,
      minute: 30,
      second: 0,
      timestamp: 1785040200,
      editable: true,
    },
    overrides
  )
}

/*
 * The action family (change 0027). Three of the four carry their last activation
 * as the *state* — an ISO timestamp, or `unknown` until the first activation —
 * which is why these default to a real timestamp rather than to `on`/`off`.
 * `script` is the odd one: it reports `on`/`off` and carries `last_triggered` as
 * an attribute.
 */
export function createSceneEntity(overrides: EntityOverrides = {}): HassEntity {
  return entity(
    'scene.movie_night',
    '2026-07-25T11:00:00.000Z',
    { friendly_name: 'Movie Night', entity_id: ['light.living_room'] },
    overrides
  )
}

export function createScriptEntity(overrides: EntityOverrides = {}): HassEntity {
  return entity(
    'script.water_garden',
    'off',
    {
      friendly_name: 'Water Garden',
      last_triggered: '2026-07-25T10:00:00.000Z',
      mode: 'single',
      current: 0,
    },
    overrides
  )
}

export function createButtonEntity(overrides: EntityOverrides = {}): HassEntity {
  return entity(
    'button.restart_bridge',
    '2026-07-25T11:30:00.000Z',
    { friendly_name: 'Restart Bridge' },
    overrides
  )
}

export function createInputButtonEntity(overrides: EntityOverrides = {}): HassEntity {
  return entity(
    'input_button.doorbell_test',
    '2026-07-25T09:00:00.000Z',
    { friendly_name: 'Doorbell Test' },
    overrides
  )
}

/**
 * A lock at rest, locked.
 *
 * `supported_features: 0` is the ordinary case rather than a degraded one: the
 * lock platform defines exactly one bit (`OPEN = 1`, the unlatch service), and
 * most locks do not advertise it. A fixture carrying the full mask would be
 * describing an unusual lock as if it were the default.
 */
export function createLockEntity(overrides: EntityOverrides = {}): HassEntity {
  return entity(
    'lock.front_door',
    'locked',
    { friendly_name: 'Front Door', supported_features: 0 },
    overrides
  )
}

/**
 * An alarm panel at rest, disarmed and codeless.
 *
 * `supported_features` carries the four arm bits this card offers (1|2|4|32 =
 * 39) but not TRIGGER — the numbering is HA's and is not the order the modes
 * are usually listed in. `code_format: null` with `code_arm_required: true` is
 * the shape a real codeless panel publishes, because HA defaults the flag to
 * true and publishes it unconditionally; a card reading the flag alone would
 * demand a code this panel cannot take.
 */
export function createAlarmEntity(overrides: EntityOverrides = {}): HassEntity {
  return entity(
    'alarm_control_panel.house',
    'disarmed',
    {
      friendly_name: 'House Alarm',
      supported_features: 39,
      code_format: null,
      code_arm_required: true,
      changed_by: null,
    },
    overrides
  )
}

/**
 * A person, at home and with no photo — the shape most households actually
 * publish.
 *
 * `entity_picture: null` rather than an omitted key, because that is what Home
 * Assistant sends: the person component sets the attribute unconditionally from
 * config, so a person who has never been given a photo carries the key holding
 * `None`. A fixture omitting it would let a card that tests for the key rather
 * than for a value pass here and render `<img src="null">` in a real house.
 *
 * `device_trackers` is present and empty for the same reason — the attribute is
 * always published — and is what change 0026 PR 2's battery derivation reads.
 */
export function createPersonEntity(overrides: EntityOverrides = {}): HassEntity {
  return entity(
    'person.jane_doe',
    'home',
    {
      friendly_name: 'Jane Doe',
      entity_picture: null,
      device_trackers: [],
      editable: true,
      id: 'jane_doe',
    },
    overrides
  )
}

/** Every domain factory, keyed by the domain it serves. */
export const entityFactories = {
  light: createLightEntity,
  switch: createSwitchEntity,
  climate: createClimateEntity,
  sensor: createSensorEntity,
  binary_sensor: createBinarySensorEntity,
  cover: createCoverEntity,
  fan: createFanEntity,
  camera: createCameraEntity,
  media_player: createMediaPlayerEntity,
  weather: createWeatherEntity,
  input_boolean: createInputBooleanEntity,
  input_number: createInputNumberEntity,
  input_select: createInputSelectEntity,
  input_text: createInputTextEntity,
  input_datetime: createInputDateTimeEntity,
  lock: createLockEntity,
  alarm_control_panel: createAlarmEntity,
  scene: createSceneEntity,
  script: createScriptEntity,
  button: createButtonEntity,
  input_button: createInputButtonEntity,
  person: createPersonEntity,
} as const satisfies Record<string, (overrides?: EntityOverrides) => HassEntity>

export type FixtureDomain = keyof typeof entityFactories

/** Build the default entity for a domain. */
export function createEntityForDomain(
  domain: FixtureDomain,
  overrides: EntityOverrides = {}
): HassEntity {
  return entityFactories[domain](overrides)
}

/** One default entity per supported domain — a whole-screen fixture set. */
export function createAllDomainEntities(): HassEntity[] {
  return (Object.keys(entityFactories) as FixtureDomain[]).map((domain) =>
    createEntityForDomain(domain)
  )
}

/** Mark any fixture unavailable without restating its attributes. */
export function asUnavailable(base: HassEntity): HassEntity {
  return { ...base, state: 'unavailable' }
}
