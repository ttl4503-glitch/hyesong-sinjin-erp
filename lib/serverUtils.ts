// 삭제(휴지통)된 영수증은 정상 화면에는 없는 것처럼 숨긴다 (관리자는 /trash에서 별도로 확인·복구).
export function hideDeletedReceipts<T extends { laborLogs: any[] }>(project: T): T {
  return {
    ...project,
    laborLogs: project.laborLogs.map((l: any) =>
      l.receipt ? { ...l, receipt: l.receipt.deletedAt ? null : { id: l.receipt.id } } : l
    ),
  };
}
