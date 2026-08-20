-- Shared visual identity for a room (memorable skins).

ALTER TABLE paste_sessions
  ADD COLUMN IF NOT EXISTS skin TEXT;
