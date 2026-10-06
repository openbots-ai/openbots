// Placeholder inboxes until the real domain is set up
export const CONTACT_EMAIL = 'hello@opendots.com'
export const PRIVACY_EMAIL = 'privacy@opendots.com'

// Landing-page sections are plain #anchors on the home page and /#anchors everywhere else
export const sectionHref = (id: string) => (window.location.pathname === '/' ? `#${id}` : `/#${id}`)
