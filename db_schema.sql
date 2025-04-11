CREATE TABLE sqlite_sequence(name,seq);
CREATE TABLE trades (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      symbol TEXT NOT NULL,
      side TEXT NOT NULL,          -- 'long' or 'short'
      qty INTEGER NOT NULL,
      entry_price REAL NOT NULL,
      exit_price REAL NOT NULL,
      entry_time TEXT NOT NULL,
      exit_time TEXT NOT NULL,
      reason TEXT,
      fees REAL DEFAULT 0.0
    );
CREATE TABLE positions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      symbol TEXT NOT NULL,
      side TEXT NOT NULL,          -- 'long' or 'short'
      qty INTEGER NOT NULL,
      entry_price REAL NOT NULL,
      entry_time TEXT NOT NULL
    , current_price REAL, last_update TEXT);
CREATE TABLE meta (key TEXT PRIMARY KEY,value TEXT);
CREATE TABLE bias_components (component TEXT PRIMARY KEY, weight REAL, last_value TEXT, score NUMERIC, last_updated TEXT);
CREATE TABLE bias_history (id INTEGER PRIMARY KEY AUTOINCREMENT,strategy TEXT,source TEXT,timestamp TEXT);
CREATE TABLE setup_choices (id INTEGER PRIMARY KEY AUTOINCREMENT, RuleID INTEGER, ChoiceValue TEXT, RiskValue TEXT, RiskDescription TEXT, ChoiceDescription TEXT, FOREIGN KEY (RuleID) REFERENCES setup_rules(RuleID));
CREATE TABLE setup_rules (RuleID INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE, label TEXT, CurrentChoiceValue TEXT);
