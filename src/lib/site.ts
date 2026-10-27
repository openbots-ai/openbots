// Where people reach us about privacy and the terms (everything else goes through GitHub issues)
export const CONTACT_EMAIL = 'shidharthasen@gmail.com'
export const PRIVACY_EMAIL = CONTACT_EMAIL

// Landing-page sections are plain #anchors on the home page and /#anchors everywhere else
export const sectionHref = (id: string) => (window.location.pathname === '/' ? `#${id}` : `/#${id}`)

// The dashboard's changelog and help links point at the GitHub repo
export const GITHUB_URL = 'https://github.com/openbots-ai/openbots'
export const ISSUES_URL = `${GITHUB_URL}/issues`
export const CHANGELOG_URL = `${GITHUB_URL}/blob/main/CHANGELOG.md`
