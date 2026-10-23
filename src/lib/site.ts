// Placeholder inboxes until the real domain is set up
export const CONTACT_EMAIL = 'hello@opendots.com'
export const PRIVACY_EMAIL = 'privacy@opendots.com'

// Landing-page sections are plain #anchors on the home page and /#anchors everywhere else
export const sectionHref = (id: string) => (window.location.pathname === '/' ? `#${id}` : `/#${id}`)

// The dashboard's changelog and help links point at the GitHub repo
export const GITHUB_URL = 'https://github.com/shidhartha-sen/opendots'
export const ISSUES_URL = `${GITHUB_URL}/issues`
export const CHANGELOG_URL = `${GITHUB_URL}/blob/main/CHANGELOG.md`
