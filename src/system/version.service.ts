import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { readFileSync } from 'fs';
import { resolve } from 'path';

export interface VersionResponse {
  version: string;
  commit: string;
  buildDate?: string;
}

@Injectable()
export class VersionService {
  private packageVersion: string | null = null;
  private packageChecked = false;

  constructor(private readonly config: ConfigService) {}

  getVersion(): VersionResponse {
    const version =
      this.config.get<string>('APP_VERSION') ??
      this.getPackageVersion() ??
      'unknown';
    const commit = this.config.get<string>('GIT_COMMIT') ?? 'unknown';
    const buildDate = this.config.get<string>('BUILD_DATE') ?? undefined;

    return buildDate ? { version, commit, buildDate } : { version, commit };
  }

  private getPackageVersion(): string | undefined {
    if (this.packageChecked) {
      return this.packageVersion ?? undefined;
    }

    this.packageChecked = true;
    try {
      const packagePath = resolve(process.cwd(), 'package.json');
      const raw = readFileSync(packagePath, 'utf8');
      const pkg = JSON.parse(raw) as { version?: unknown };
      if (typeof pkg.version === 'string' && pkg.version.trim().length > 0) {
        this.packageVersion = pkg.version.trim();
        return this.packageVersion;
      }
    } catch {
      // Ignore missing or unreadable package.json
    }

    this.packageVersion = null;
    return undefined;
  }
}
