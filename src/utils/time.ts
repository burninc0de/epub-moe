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

export const formatSMILDuration = (seconds: number): string => {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toFixed(2).padStart(5, '0')}`;
};

export const parseTimeInput = (timeStr: string): number => {
  if (timeStr.endsWith('s')) {
    return parseFloat(timeStr.slice(0, -1)) || 0;
  }
  if (timeStr.includes(':')) {
    const parts = timeStr.split(':').map(p => parseFloat(p));
    if (parts.some(p => Number.isNaN(p))) return 0;
    return parts.reduce((acc, curr, idx) => acc + curr * Math.pow(60, parts.length - idx - 1), 0);
  }
  return parseFloat(timeStr) || 0;
};
