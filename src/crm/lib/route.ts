// The CRM is reachable only at this exact path; nothing links to it
export const isCrmPath = (path: string) => (path.replace(/\/+$/, '') || '/') === '/crm'
