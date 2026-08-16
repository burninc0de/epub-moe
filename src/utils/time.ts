export const formatTime = (seconds: number): string => {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

export const formatTimeWithMs = (seconds: number): string => {
  const totalMs = Math.round(seconds * 1000);
  const mins = Math.floor(totalMs / 60000);
  const secs = Math.floor((totalMs % 60000) / 1000);
  const ms = totalMs % 1000;
  return `${mins}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(3, '0')}`;
};

export const parseTimeInput = (timeStr: string): number => {
  const parts = timeStr.split(':');
  if (parts.length === 2) {
    const [mins, secsMs] = parts;
    const [secs, ms = '0'] = secsMs.split('.');
    return parseInt(mins, 10) * 60 + parseInt(secs, 10) + parseInt(ms.padEnd(3, '0'), 10) / 1000;
  }
  return parseFloat(timeStr) || 0;
};
