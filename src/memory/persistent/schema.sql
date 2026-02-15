-- KinChat Database Schema

CREATE TABLE IF NOT EXISTS characters (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  archetype TEXT NOT NULL,
  archetype_id TEXT NOT NULL DEFAULT '',
  gender TEXT NOT NULL DEFAULT 'masculin',
  personality TEXT NOT NULL DEFAULT 'courageux',
  backstory TEXT NOT NULL,
  ubuntu INTEGER NOT NULL CHECK(ubuntu BETWEEN 1 AND 10),
  maat INTEGER NOT NULL CHECK(maat BETWEEN 1 AND 10),
  sankofa INTEGER NOT NULL CHECK(sankofa BETWEEN 1 AND 10),
  biso INTEGER NOT NULL CHECK(biso BETWEEN 1 AND 10),
  hp INTEGER NOT NULL,
  max_hp INTEGER NOT NULL,
  inventory_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  character_id TEXT NOT NULL REFERENCES characters(id),
  book_id TEXT NOT NULL DEFAULT 'kinara',
  game_mode TEXT NOT NULL DEFAULT 'normal',
  current_beat INTEGER NOT NULL DEFAULT 1,
  current_scene INTEGER NOT NULL DEFAULT 1,
  turn_count INTEGER NOT NULL DEFAULT 0,
  world_flags_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS npc_relationships (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id),
  npc_id TEXT NOT NULL,
  npc_name TEXT NOT NULL,
  affinity INTEGER NOT NULL DEFAULT 0 CHECK(affinity BETWEEN -10 AND 10),
  last_interaction_beat INTEGER NOT NULL DEFAULT 0,
  notes_json TEXT NOT NULL DEFAULT '[]',
  UNIQUE(session_id, npc_id)
);

CREATE TABLE IF NOT EXISTS action_journal (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id),
  turn_number INTEGER NOT NULL,
  beat INTEGER NOT NULL,
  scene INTEGER NOT NULL,
  choice_id TEXT NOT NULL,
  choice_text TEXT NOT NULL,
  dominant_stat TEXT NOT NULL,
  dice_result_json TEXT,
  state_changes_json TEXT NOT NULL DEFAULT '[]',
  narration_text TEXT NOT NULL DEFAULT '',
  timestamp TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS action_summaries (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id),
  type TEXT NOT NULL CHECK(type IN ('turn', 'beat')),
  beat_number INTEGER NOT NULL,
  up_to_turn INTEGER NOT NULL,
  summary_text TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS beat_pacing (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id),
  beat_number INTEGER NOT NULL,
  tension_curve TEXT NOT NULL DEFAULT 'rising',
  emotional_tone TEXT NOT NULL DEFAULT 'wonder',
  checkpoints_json TEXT NOT NULL DEFAULT '[]',
  scene_escalation REAL NOT NULL DEFAULT 0.0,
  max_turns_before_force INTEGER NOT NULL DEFAULT 8,
  turns_in_beat INTEGER NOT NULL DEFAULT 0,
  UNIQUE(session_id, beat_number)
);

CREATE TABLE IF NOT EXISTS saves (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id),
  save_name TEXT NOT NULL,
  character_name TEXT NOT NULL,
  beat_number INTEGER NOT NULL,
  snapshot_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Conversation cache for LLM context continuity
CREATE TABLE IF NOT EXISTS conversation_cache (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id),
  turn_number INTEGER NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_journal_session ON action_journal(session_id, turn_number);
CREATE INDEX IF NOT EXISTS idx_journal_session_beat ON action_journal(session_id, beat);
CREATE INDEX IF NOT EXISTS idx_relationships_session ON npc_relationships(session_id);
CREATE INDEX IF NOT EXISTS idx_relationships_session_npc ON npc_relationships(session_id, npc_id);
CREATE INDEX IF NOT EXISTS idx_saves_session ON saves(session_id);
CREATE INDEX IF NOT EXISTS idx_summaries_session ON action_summaries(session_id, type);
CREATE INDEX IF NOT EXISTS idx_summaries_uptoturn ON action_summaries(session_id, up_to_turn);
CREATE INDEX IF NOT EXISTS idx_pacing_session ON beat_pacing(session_id, beat_number);
CREATE INDEX IF NOT EXISTS idx_conversation_session ON conversation_cache(session_id, turn_number);
CREATE INDEX IF NOT EXISTS idx_conversation_created ON conversation_cache(session_id, created_at);

-- Multiplayer rooms
CREATE TABLE IF NOT EXISTS rooms (
  id TEXT PRIMARY KEY,
  session_id TEXT REFERENCES sessions(id),
  host_player_id TEXT NOT NULL,
  book_id TEXT NOT NULL,
  join_code TEXT UNIQUE NOT NULL,
  status TEXT NOT NULL DEFAULT 'lobby',
  max_players INTEGER NOT NULL DEFAULT 4,
  current_turn_player_id TEXT,
  turn_order_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS room_players (
  room_id TEXT NOT NULL REFERENCES rooms(id),
  player_id TEXT NOT NULL,
  player_name TEXT NOT NULL,
  character_id TEXT REFERENCES characters(id),
  joined_at TEXT NOT NULL DEFAULT (datetime('now')),
  is_active INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (room_id, player_id)
);

CREATE INDEX IF NOT EXISTS idx_rooms_join_code ON rooms(join_code);
CREATE INDEX IF NOT EXISTS idx_room_players_room ON room_players(room_id);
