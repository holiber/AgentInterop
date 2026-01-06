export function helloWorld(name?: string): string {
  const who = name?.trim() ? name.trim() : "world";
  return `Hello, ${who}!`;
}

