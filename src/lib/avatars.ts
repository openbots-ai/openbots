// Call screen wash tinted by the caller, the way iOS carries a contact's color into the call:
// a soft grey at the top that deepens into the contact's hue toward the bottom
export const callBackground = (hue: number) =>
    `linear-gradient(180deg, hsl(${hue} 4% 44%) 0%, hsl(${hue} 9% 38%) 30%, hsl(${hue} 20% 30%) 62%, hsl(${hue} 32% 23%) 88%, hsl(${hue} 34% 21%) 100%)`
