CREATE TABLE IF NOT EXISTS `skill_version_history` (
  `id` varchar(36) NOT NULL,
  `capability` varchar(32) NOT NULL,
  `sc_type` varchar(32) NOT NULL,
  `subclass` varchar(255) NOT NULL DEFAULT '',
  `target_type` varchar(32) NOT NULL,
  `version_no` int NOT NULL,
  `action_type` varchar(32) NOT NULL,
  `editor` varchar(64) NOT NULL,
  `change_note` varchar(255) NOT NULL DEFAULT '',
  `skill_md` longtext NOT NULL,
  `source_snapshot` varchar(64) NOT NULL DEFAULT '',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
);
