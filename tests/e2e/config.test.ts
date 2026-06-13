import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'fs';
import { tmpdir } from 'os';
import * as path from 'path';

const { getHomedir, setHomedir } = vi.hoisted(() => {
  let homedir = '';
  return {
    getHomedir: () => homedir,
    setHomedir: (v: string) => { homedir = v; },
  };
});

vi.mock('os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('os')>();
  return { ...actual, homedir: getHomedir };
});

import { loadConfig } from '../../src/router/config';

let tmpDir: string;
let homeDir: string;
let projectDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(path.join(tmpdir(), 'claude-router-config-'));
  homeDir = path.join(tmpDir, 'home');
  projectDir = path.join(tmpDir, 'project');
  mkdirSync(homeDir, { recursive: true });
  mkdirSync(projectDir, { recursive: true });
  setHomedir(homeDir);
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

function writeGlobalConfig(config: object): void {
  writeFileSync(path.join(homeDir, '.claude-router.json'), JSON.stringify(config), 'utf-8');
}

function writeProjectConfig(config: object): void {
  writeFileSync(path.join(projectDir, '.claude-router.json'), JSON.stringify(config), 'utf-8');
}

describe('config loading e2e', () => {
  describe('defaults', () => {
    it('LOW tier defaults to haiku model', () => {
      const config = loadConfig(projectDir);
      expect(config.tiers.LOW).toBe('claude-haiku-4-5-20251001');
    });

    it('MEDIUM tier defaults to sonnet model', () => {
      const config = loadConfig(projectDir);
      expect(config.tiers.MEDIUM).toBe('claude-sonnet-4-6');
    });

    it('HIGH tier defaults to opus model', () => {
      const config = loadConfig(projectDir);
      expect(config.tiers.HIGH).toBe('claude-opus-4-8');
    });

    it('fallback defaults to sonnet', () => {
      const config = loadConfig(projectDir);
      expect(config.fallback).toBe('claude-sonnet-4-6');
    });

    it('conservative defaults to false', () => {
      const config = loadConfig(projectDir);
      expect(config.conservative).toBe(false);
    });

    it('override_keyword defaults to //opus', () => {
      const config = loadConfig(projectDir);
      expect(config.override_keyword).toBe('//opus');
    });
  });

  describe('global config only', () => {
    it('sets LOW model → LOW uses custom, MEDIUM and HIGH use defaults', () => {
      writeGlobalConfig({ tiers: { LOW: 'claude-haiku-custom' } });
      const config = loadConfig(projectDir);
      expect(config.tiers.LOW).toBe('claude-haiku-custom');
      expect(config.tiers.MEDIUM).toBe('claude-sonnet-4-6');
      expect(config.tiers.HIGH).toBe('claude-opus-4-8');
    });

    it('sets conservative: true → reflects in loaded config', () => {
      writeGlobalConfig({ conservative: true });
      const config = loadConfig(projectDir);
      expect(config.conservative).toBe(true);
    });

    it('sets override_keyword to "//sonnet" → reflects in loaded config', () => {
      writeGlobalConfig({ override_keyword: '//sonnet' });
      const config = loadConfig(projectDir);
      expect(config.override_keyword).toBe('//sonnet');
    });
  });

  describe('project config only', () => {
    it('sets MEDIUM model → MEDIUM uses custom, others use defaults', () => {
      writeProjectConfig({ tiers: { MEDIUM: 'claude-sonnet-custom' } });
      const config = loadConfig(projectDir);
      expect(config.tiers.MEDIUM).toBe('claude-sonnet-custom');
      expect(config.tiers.LOW).toBe('claude-haiku-4-5-20251001');
      expect(config.tiers.HIGH).toBe('claude-opus-4-8');
    });
  });

  describe('precedence', () => {
    it('global sets LOW to X, project sets LOW to Y → Y wins', () => {
      writeGlobalConfig({ tiers: { LOW: 'global-haiku' } });
      writeProjectConfig({ tiers: { LOW: 'project-haiku' } });
      const config = loadConfig(projectDir);
      expect(config.tiers.LOW).toBe('project-haiku');
    });

    it('global sets conservative: true, project does not set it → stays true', () => {
      writeGlobalConfig({ conservative: true });
      // Project config only sets a tier, not conservative
      writeProjectConfig({ tiers: { LOW: 'claude-haiku-custom' } });
      const config = loadConfig(projectDir);
      expect(config.conservative).toBe(true);
    });

    it('project sets conservative: false, global sets true → false wins', () => {
      writeGlobalConfig({ conservative: true });
      writeProjectConfig({ conservative: false });
      const config = loadConfig(projectDir);
      expect(config.conservative).toBe(false);
    });
  });

  describe('resilience', () => {
    it('global config is empty file → defaults, no crash', () => {
      writeFileSync(path.join(homeDir, '.claude-router.json'), '', 'utf-8');
      const config = loadConfig(projectDir);
      expect(config.tiers.LOW).toBe('claude-haiku-4-5-20251001');
    });

    it('global config is invalid JSON → defaults, no crash', () => {
      writeFileSync(path.join(homeDir, '.claude-router.json'), '{not valid json', 'utf-8');
      const config = loadConfig(projectDir);
      expect(config.tiers.LOW).toBe('claude-haiku-4-5-20251001');
    });

    it('global config is a JSON array → defaults, no crash', () => {
      writeFileSync(path.join(homeDir, '.claude-router.json'), '[1, 2, 3]', 'utf-8');
      const config = loadConfig(projectDir);
      expect(config.tiers.LOW).toBe('claude-haiku-4-5-20251001');
    });

    it('global config has extra unknown fields → ignored, no crash', () => {
      writeGlobalConfig({ tiers: { LOW: 'claude-haiku-custom' }, banana: true, nested: { a: 1 } });
      const config = loadConfig(projectDir);
      expect(config.tiers.LOW).toBe('claude-haiku-custom');
      expect((config as any).banana).toBeUndefined();
    });

    it('global config has tiers as a string → defaults for tiers, no crash', () => {
      writeGlobalConfig({ tiers: 'not an object' });
      const config = loadConfig(projectDir);
      expect(config.tiers.LOW).toBeDefined();
      expect(config.tiers.MEDIUM).toBeDefined();
      expect(config.tiers.HIGH).toBeDefined();
    });

    it('project overrides one tier, global overrides another → both applied', () => {
      writeGlobalConfig({ tiers: { LOW: 'global-haiku' } });
      writeProjectConfig({ tiers: { MEDIUM: 'project-sonnet' } });
      const config = loadConfig(projectDir);
      expect(config.tiers.LOW).toBe('global-haiku');
      expect(config.tiers.MEDIUM).toBe('project-sonnet');
      expect(config.tiers.HIGH).toBe('claude-opus-4-8');
    });
  });

  describe('path handling', () => {
    it('global config uses os.homedir()', () => {
      writeGlobalConfig({ conservative: true });
      const config = loadConfig(projectDir);
      expect(config.conservative).toBe(true);
    });

    it('CWD resolution uses provided cwd parameter', () => {
      const otherProject = path.join(tmpDir, 'other-project');
      mkdirSync(otherProject, { recursive: true });
      writeFileSync(
        path.join(otherProject, '.claude-router.json'),
        JSON.stringify({ conservative: true }),
        'utf-8'
      );
      const config = loadConfig(otherProject);
      expect(config.conservative).toBe(true);
    });
  });
});
