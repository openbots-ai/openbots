// OpenBots is open source and self-hosted: questions, bugs and ideas go to the GitHub repo, not an inbox
export const GITHUB_URL = 'https://github.com/shidhartha-sen/opendots'
export const README_URL = `${GITHUB_URL}#readme`
export const ISSUES_URL = `${GITHUB_URL}/issues`
export const NEW_ISSUE_URL = `${GITHUB_URL}/issues/new`
export const CHANGELOG_URL = `${GITHUB_URL}/blob/main/CHANGELOG.md`
export const LICENSE_URL = `${GITHUB_URL}/blob/main/LICENSE`
export const SECURITY_URL = `${GITHUB_URL}/blob/main/SECURITY.md`

// Landing-page sections are plain #anchors on the home page and /#anchors everywhere else
export const sectionHref = (id: string) => (window.location.pathname === '/' ? `#${id}` : `/#${id}`)
