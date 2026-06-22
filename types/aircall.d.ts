declare module 'aircall-everywhere' {
  interface WorkspaceSettings {
    domToLoadWorkspace: string
    integrationToLoad?: 'zendesk' | 'hubspot' | 'generic'
    onLogin?:  (settings: Record<string, unknown>) => void
    onLogout?: () => void
    size?:     'big' | 'small'
  }

  interface CallInfo {
    from?:        string
    to?:          string
    call_id?:     number
    duration?:    number
    answered_at?: string
    ended_at?:    string
  }

  class AircallWorkspace {
    constructor(settings: WorkspaceSettings)
    on(event: string, callback: (info: CallInfo) => void): void
    send(event: string, payload: Record<string, unknown>, callback?: (success: boolean, data?: unknown) => void): void
    isLoggedIn(callback: (loggedIn: boolean) => void): void
  }

  export default AircallWorkspace
}
