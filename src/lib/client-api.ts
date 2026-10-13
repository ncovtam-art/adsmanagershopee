export async function requestApi<T>(
  url: string,
  options?: RequestInit,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      ...options,
      headers: { "Content-Type": "application/json", ...options?.headers },
      cache: "no-store",
    });
  } catch {
    throw new Error(
      "Không thể kết nối máy chủ. Vui lòng kiểm tra kết nối rồi thử lại.",
    );
  }
  const payload = await response.json().catch(() => null);
  if (!response.ok)
    throw new Error(
      payload?.error?.message ??
        "Không thể hoàn tất yêu cầu. Vui lòng thử lại.",
    );
  return payload.data as T;
}
