import { EventEmitter } from 'events';
import { shell, app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { Logger } from '../utils/logger';

const STRAVU_API_BASE = (process.env.NODE_ENV === 'development' || !app.isPackaged)
  ? 'http://localhost:9100'
  : 'https://api.stravu.com';

interface AuthSession {
  sessionId: string;
  authUrl: string;
  status: 'pending' | 'completed' | 'denied' | 'expired';
}

interface AuthResult {
  jwt: string;
  memberId: string;
  orgSlug: string;
  scopes: string[];
  status?: string;
}

interface MemberInfo {
  memberId: string;
  orgSlug: string;
  scopes: string[];
}

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'expired' | 'error';

export interface ConnectionState {
  status: ConnectionStatus;
  memberInfo?: MemberInfo;
  error?: string;
}

export class StravuAuthManager extends EventEmitter {
  private jwtToken: string | null = null;
  private memberInfo: MemberInfo | null = null;
  private connectionStatus: ConnectionStatus = 'disconnected';
  private activeAuthSession: AuthSession | null = null;
  private logger: Logger;
  private storePath: string;

  constructor(logger: Logger) {
    super();
    this.logger = logger;
    // MCP functionality disabled - no credential storage
    const userDataPath = app.getPath('userData');
    this.storePath = path.join(userDataPath, 'stravu-auth.json');
    // Don't load any stored credentials
  }

  private getStoreData(): Record<string, unknown> {
    // MCP functionality disabled - no credential storage
    return {};
  }

  private setStoreData(data: Record<string, unknown>): void {
    // MCP functionality disabled - no credential storage
  }

  async authenticate(): Promise<AuthResult> {
    // MCP functionality disabled
    this.connectionStatus = 'error';
    this.emit('status-changed', this.getConnectionState());
    const error = new Error('Functionality coming soon');
    throw error;
  }

  async pollForCompletion(sessionId: string): Promise<AuthResult> {
    try {
      const response = await fetch(`${STRAVU_API_BASE}/mcp/auth/status/${sessionId}`);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const status: {
        status: string;
        jwt_token?: string;
        member_id?: string;
        org_slug?: string;
        scopes?: string[];
        expires_at?: string;
      } = await response.json();

      if (status.status === 'completed') {
        const authResult: AuthResult = {
          jwt: status.jwt_token || '',
          memberId: status.member_id || '',
          orgSlug: status.org_slug || '',
          scopes: status.scopes || []
        };

        this.logger.info('Authentication successful');

        await this.storeCredentials(authResult);
        this.connectionStatus = 'connected';
        this.emit('status-changed', this.getConnectionState());

        return authResult;
      } else if (status.status === 'denied' || status.status === 'expired') {
        throw new Error('Authentication failed or denied');
      } else {
        // Still pending
        return { status: 'pending' } as AuthResult;
      }
    } catch (error) {
      this.logger.error('Failed to check auth status:', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  private async initiateAuth(): Promise<AuthSession> {
    // MCP functionality disabled
    throw new Error('Functionality coming soon');
  }

  private async storeCredentials(authResult: AuthResult): Promise<void> {
    try {
      // Store JWT and member info persistently
      this.jwtToken = authResult.jwt;
      this.memberInfo = {
        memberId: authResult.memberId,
        orgSlug: authResult.orgSlug,
        scopes: authResult.scopes
      };

      // Store in encrypted file
      const data = this.getStoreData();
      data.jwt_token = authResult.jwt;
      data.member_info = this.memberInfo;
      data.auth_timestamp = Date.now();
      this.setStoreData(data);

      this.logger.info(`Stravu authentication successful for ${authResult.orgSlug}`);
      this.logger.info('Credentials stored securely');
    } catch (error) {
      this.logger.error('Failed to store credentials:', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  private async loadStoredCredentials(): Promise<void> {
    // MCP functionality disabled - no credential loading
    this.connectionStatus = 'disconnected';
    this.emit('status-changed', this.getConnectionState());
  }

  private clearStoredCredentials(): void {
    this.jwtToken = null;
    this.memberInfo = null;
    this.connectionStatus = 'disconnected';
    try {
      if (fs.existsSync(this.storePath)) {
        fs.unlinkSync(this.storePath);
      }
    } catch (error) {
      this.logger.error('Failed to clear stored credentials:', error instanceof Error ? error : new Error(String(error)));
    }
  }

  async makeAuthenticatedRequest(endpoint: string, options: RequestInit = {}): Promise<Response> {
    if (!this.jwtToken) {
      throw new Error('Not authenticated');
    }

    const response = await fetch(`${STRAVU_API_BASE}${endpoint}`, {
      ...options,
      headers: {
        'Authorization': `Bearer ${this.jwtToken}`,
        'Content-Type': 'application/json',
        ...options.headers
      }
    });

    if (response.status === 401) {
      // JWT expired or revoked, trigger re-auth
      const responseText = await response.text();
      this.logger.warn('JWT token expired, clearing credentials');
      this.connectionStatus = 'expired';
      this.clearStoredCredentials();
      this.emit('status-changed', this.getConnectionState());
      throw new Error('Authentication expired');
    }

    return response;
  }

  async disconnect(): Promise<void> {
    try {
      if (this.jwtToken) {
        // Optionally revoke the token on the server
        try {
          await this.makeAuthenticatedRequest('/mcp/auth/revoke', {
            method: 'POST'
          });
        } catch (error) {
          // Ignore revocation errors, just clear local state
          this.logger.warn('Failed to revoke token on server:', error instanceof Error ? error : new Error(String(error)));
        }
      }

      this.clearStoredCredentials();
      this.activeAuthSession = null;
      this.emit('status-changed', this.getConnectionState());

      this.logger.info('Stravu disconnected successfully');
    } catch (error) {
      this.logger.error('Failed to disconnect from Stravu:', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  getConnectionState(): ConnectionState {
    return {
      status: this.connectionStatus,
      memberInfo: this.memberInfo || undefined,
      error: this.connectionStatus === 'error' ? 'Functionality coming soon' : undefined
    };
  }

  isConnected(): boolean {
    return this.connectionStatus === 'connected' && !!this.jwtToken;
  }

  getCurrentSession(): AuthSession | null {
    return this.activeAuthSession;
  }

  // Test connection with a simple ping
  async testConnection(): Promise<boolean> {
    // MCP functionality disabled
    return false;
  }
}
