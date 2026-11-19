export function isComposingKeypress(event) {
  const keyboardEvent = event?.nativeEvent ?? event;
  return Boolean(keyboardEvent?.isComposing || keyboardEvent?.keyCode === 229);
}
