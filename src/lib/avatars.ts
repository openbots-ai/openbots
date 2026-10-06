// iOS-style contact monogram backgrounds: a soft top-to-bottom gradient, lighter up top.
// Agents with a signature color are listed here; everyone else derives one from their hue.
const SIGNATURE: Record<string, string> = {
    // Deep purple near Apple's high-contrast system purple (#8944AB), lifted at the top like iOS contact photos
    Emily: 'linear-gradient(180deg, #9A5FC4 0%, #6B2F96 100%)',
}

export const avatarBackground = (name: string, hue: number) =>
    SIGNATURE[name] ?? `linear-gradient(180deg, hsl(${hue} 35% 68%), hsl(${hue} 30% 50%))`

// Call screen wash tinted by the caller, the way iOS carries a contact's color into the call:
// a soft grey at the top that deepens into the contact's hue toward the bottom
export const callBackground = (hue: number) =>
    `linear-gradient(180deg, hsl(${hue} 4% 44%) 0%, hsl(${hue} 9% 38%) 30%, hsl(${hue} 20% 30%) 62%, hsl(${hue} 32% 23%) 88%, hsl(${hue} 34% 21%) 100%)`
