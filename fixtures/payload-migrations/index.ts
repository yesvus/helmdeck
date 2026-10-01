import * as migration_20261001_095038_initial from './20261001_095038_initial';

export const migrations = [
  {
    up: migration_20261001_095038_initial.up,
    down: migration_20261001_095038_initial.down,
    name: '20261001_095038_initial'
  },
];
