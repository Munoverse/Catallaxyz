const QUESTION_PREFIX = 'market:question:';

export const setMarketQuestion = (marketAddress: string, question: string) => {
  if (typeof window === 'undefined') return;
  const trimmed = question.trim();
  if (!trimmed) return;
  window.localStorage.setItem(`${QUESTION_PREFIX}${marketAddress}`, trimmed);
};

export const getMarketQuestion = (marketAddress: string) => {
  if (typeof window === 'undefined') return undefined;
  return window.localStorage.getItem(`${QUESTION_PREFIX}${marketAddress}`) ?? undefined;
};
