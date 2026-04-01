const digitGroupRegex = /\d{6,}/g;

export const maskSensitiveDigits = (value: string): string =>
  value.replace(digitGroupRegex, (match) => {
    if (match.length <= 4) {
      return match;
    }

    const visible = match.slice(-4);
    return `${"*".repeat(match.length - 4)}${visible}`;
  });

export const maskNullableText = (value: string | null): string | null =>
  value === null ? null : maskSensitiveDigits(value);
