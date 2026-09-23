CREATE TABLE IF NOT EXISTS sync_profiles (
  id TEXT PRIMARY KEY,
  revision INTEGER NOT NULL,
  write_id TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  bucket TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS sync_profile_bucket ON sync_profiles(bucket);
CREATE INDEX IF NOT EXISTS sync_profile_created ON sync_profiles(created_at);
CREATE TABLE IF NOT EXISTS sync_parts (
  profile_id TEXT NOT NULL,
  revision INTEGER NOT NULL,
  part INTEGER NOT NULL,
  data TEXT NOT NULL,
  PRIMARY KEY (profile_id, revision, part),
  FOREIGN KEY (profile_id) REFERENCES sync_profiles(id)
);
