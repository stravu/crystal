import { EventEmitter } from 'events';
import { shell, app } from 'electron';
import { safeStorage } from 'electron';
import ElectronStore from 'electron-store';
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
  private store: ElectronStore;

  constructor(logger: Logger) {
    super();
    this.logger = logger;
    this.store = new ElectronStore({
      name: 'stravu-auth',
      encryptionKey: 'stravu-crystal-auth-key' // Simple key for development
    });
    this.loadStoredCredentials();
  }

  async authenticate(): Promise<AuthResult> {
    try {
      this.connectionStatus = 'connecting';
      this.emit('status-changed', this.getConnectionState());

      // 1. Initiate auth session with Stravu
      const authSession = await this.initiateAuth();
      this.activeAuthSession = authSession;

      // 2. Open browser for user authentication
      await shell.openExternal(authSession.authUrl);

      // 3. Return session info for polling
      return {
        jwt: '',
        memberId: '',
        orgSlug: '',
        scopes: [],
        ...authSession
      } as any;

    } catch (error) {
      this.connectionStatus = 'error';
      this.emit('status-changed', this.getConnectionState());
      this.logger.error('Authentication failed:', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  async pollForCompletion(sessionId: string): Promise<AuthResult> {
    try {
      const response = await fetch(`${STRAVU_API_BASE}/mcp/auth/status/${sessionId}`);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const status: any = await response.json();

      if (status.status === 'completed') {
        const authResult: AuthResult = {
          jwt: status.jwt_token,
          memberId: status.member_id,
          orgSlug: status.org_slug,
          scopes: status.scopes
        };

        this.logger.info(`Received JWT token (first 50 chars): ${status.jwt_token?.substring(0, 50)}...`);
        this.logger.info(`JWT expires at: ${status.expires_at || 'not provided'}`);

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
    try {
      this.logger.info(`Attempting to connect to: ${STRAVU_API_BASE}/mcp/auth/initiate`);
      
      // Try using fetch with more specific configuration for Electron
      const response = await fetch(`${STRAVU_API_BASE}/mcp/auth/initiate`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'User-Agent': 'Crystal-Electron/1.0.0'
        },
        body: JSON.stringify({
          client_type: 'electron',
          client_name: 'Crystal'
        }),
        // Add Electron-specific options
        mode: 'cors',
        credentials: 'omit'
      });

      this.logger.info(`Response status: ${response.status} ${response.statusText}`);

      if (!response.ok) {
        const responseText = await response.text();
        this.logger.error(`Response body: ${responseText}`);
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data: any = await response.json();
      this.logger.info(`Auth session created: ${data.session_id}`);
      
      return {
        sessionId: data.session_id,
        authUrl: data.auth_url,
        status: 'pending'
      };
    } catch (error) {
      this.logger.error(`Detailed fetch error: ${error}`);
      if (error instanceof TypeError && error.message === 'fetch failed') {
        this.logger.error(`This is likely a network connectivity issue`);
        this.logger.error(`Check if ${STRAVU_API_BASE} is accessible`);
      }
      this.logger.error(`Error cause: ${(error as any)?.cause}`);
      this.logger.error(`Error code: ${(error as any)?.code}`);
      throw error;
    }
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

      // Store in encrypted electron store
      (this.store as any).set('jwt_token', authResult.jwt);
      (this.store as any).set('member_info', this.memberInfo);
      (this.store as any).set('auth_timestamp', Date.now());

      this.logger.info(`Stravu authentication successful for ${authResult.orgSlug}`);
      this.logger.info('Credentials stored securely');
    } catch (error) {
      this.logger.error('Failed to store credentials:', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  private async loadStoredCredentials(): Promise<void> {
    try {
      this.logger.info('Checking for stored Stravu credentials...');

      const storedJwt = (this.store as any).get('jwt_token') as string | undefined;
      const storedMemberInfo = (this.store as any).get('member_info') as MemberInfo | undefined;
      const authTimestamp = (this.store as any).get('auth_timestamp') as number | undefined;

      if (storedJwt && storedMemberInfo && authTimestamp) {
        // Check if token is not too old (48 hours as per backend)
        const tokenAge = Date.now() - authTimestamp;
        const maxAge = 48 * 60 * 60 * 1000; // 48 hours in milliseconds

        if (tokenAge < maxAge) {
          this.jwtToken = storedJwt;
          this.memberInfo = storedMemberInfo;
          
          // Test the token to make sure it's still valid
          try {
            this.logger.info('Validating stored JWT token...');
            const testResponse = await this.makeAuthenticatedRequest('/mcp/v1/ping');
            if (testResponse.ok) {
              this.connectionStatus = 'connected';
              this.logger.info(`Restored Stravu session for ${storedMemberInfo.orgSlug}`);
              this.emit('status-changed', this.getConnectionState());
              return;
            }
          } catch (error) {
            this.logger.warn('Stored token validation failed:', error instanceof Error ? error : new Error(String(error)));
          }
        } else {
          this.logger.info('Stored token is expired, will need re-authentication');
        }
      } else {
        this.logger.info('No stored Stravu credentials found');
      }

      // Clear invalid/expired credentials and emit disconnected status
      this.clearStoredCredentials();
      this.emit('status-changed', this.getConnectionState());
    } catch (error) {
      this.logger.error('Failed to load stored credentials:', error instanceof Error ? error : new Error(String(error)));
      this.clearStoredCredentials();
      this.emit('status-changed', this.getConnectionState());
    }
  }

  private clearStoredCredentials(): void {
    this.jwtToken = null;
    this.memberInfo = null;
    this.connectionStatus = 'disconnected';
    (this.store as any).delete('jwt_token');
    (this.store as any).delete('member_info');
    (this.store as any).delete('auth_timestamp');
  }

  async makeAuthenticatedRequest(endpoint: string, options: RequestInit = {}): Promise<Response> {
    if (!this.jwtToken) {
      throw new Error('Not authenticated');
    }

    this.logger.info(`Making authenticated request to: ${STRAVU_API_BASE}${endpoint}`);
    this.logger.info(`Using JWT token (first 30 chars): ${this.jwtToken.substring(0, 30)}...`);

    const response = await fetch(`${STRAVU_API_BASE}${endpoint}`, {
      ...options,
      headers: {
        'Authorization': `Bearer ${this.jwtToken}`,
        'Content-Type': 'application/json',
        ...options.headers
      }
    });

    this.logger.info(`Response status: ${response.status} ${response.statusText}`);

    if (response.status === 401) {
      // JWT expired or revoked, trigger re-auth
      const responseText = await response.text();
      this.logger.warn(`JWT token expired or invalid. Response: ${responseText}`);
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
      error: this.connectionStatus === 'error' ? 'Connection failed' : undefined
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
    try {
      if (!this.isConnected()) {
        return false;
      }

      const response = await this.makeAuthenticatedRequest('/mcp/v1/ping');
      return response.ok;
    } catch (error) {
      this.logger.error('Connection test failed:', error instanceof Error ? error : new Error(String(error)));
      return false;
    }
  }
}
