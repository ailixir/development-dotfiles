// Deliberate violation: the same flag inside a template literal, so the gate cannot be walked
// past by building the string a different way (story 10.12 AC-6a).
export const extra = `--disable-setuid-sandbox --disable-gpu-sandbox`;
