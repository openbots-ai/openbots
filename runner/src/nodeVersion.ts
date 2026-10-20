// The oldest Node.js the engine runs on: node:sqlite works without a flag from 22.13 (matches package.json engines)
export const MIN_NODE = '22.13'

export function nodeTooOld(version: string = process.versions.node) {
    const [major, minor] = version.replace(/^v/, '').split('.').map(Number)
    const [needMajor, needMinor] = MIN_NODE.split('.').map(Number)
    return major < needMajor || (major === needMajor && minor < needMinor)
}

export const nodeVersionError = (version: string = process.version) =>
    `OpenBots needs Node.js ${MIN_NODE} or newer, and this is ${version}. Install the current LTS from https://nodejs.org, then start the engine again.`
