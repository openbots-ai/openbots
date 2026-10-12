import type { Doc } from '../_generated/dataModel'

// What the dashboard needs to know about each connectable account. No dependencies: the browser imports this.

export type Provider = Doc<'connections'>['provider']

// The fields each provider's connect form asks for, in order; `secret` fields are masked in the form
export const FIELDS: Record<Provider, { key: string; label: string; secret?: boolean; placeholder?: string }[]> = {
    openai: [{ key: 'apiKey', label: 'API key', secret: true, placeholder: 'sk-…' }],
    anthropic: [{ key: 'apiKey', label: 'API key', secret: true, placeholder: 'sk-ant-…' }],
    google: [{ key: 'apiKey', label: 'API key', secret: true, placeholder: 'AIza…' }],
    xai: [{ key: 'apiKey', label: 'API key', secret: true, placeholder: 'xai-…' }],
    twilio: [
        { key: 'accountSid', label: 'Account SID', placeholder: 'AC…' },
        { key: 'authToken', label: 'Auth token', secret: true },
    ],
    sendblue: [
        { key: 'keyId', label: 'API key ID' },
        { key: 'secret', label: 'API secret', secret: true },
    ],
    bluebubbles: [
        { key: 'serverUrl', label: 'Server URL', placeholder: 'https://your-mac.ngrok.app' },
        { key: 'password', label: 'Server password', secret: true },
    ],
    resend: [
        { key: 'apiKey', label: 'API key', secret: true, placeholder: 're_…' },
        { key: 'from', label: 'Send from', placeholder: 'OpenBots <agents@yourdomain.com>' },
    ],
}

