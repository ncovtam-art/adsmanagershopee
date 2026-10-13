"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Role } from "@/server/database/schema";
import { roleLabels } from "@/lib/navigation";
import { requestApi } from "@/lib/client-api";
import { Badge, Icon, Notice } from "./ui";
import { Modal } from "./modal";

type Member = {
  id: string;
  name: string;
  email: string;
  role: Role;
  active: boolean;
  createdAt: string;
};
export function TeamManager({
  members,
  actorId,
  actorRole,
}: {
  members: Member[];
  actorId: string;
  actorRole: Role;
}) {
  const [adding, setAdding] = useState(false);
  const [pending, setPending] = useState(false);
  const [target, setTarget] = useState<Member | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const router = useRouter();

  async function create(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = Object.fromEntries(new FormData(form));
    setPending(true);
    setError("");
    setNotice("");
    try {
      await requestApi("/api/team", {
        method: "POST",
        body: JSON.stringify(values),
      });
      form.reset();
      setAdding(false);
      setNotice(
        "Đã tạo tài khoản nhân viên. Hãy gửi thông tin đăng nhập qua kênh riêng an toàn.",
      );
      router.refresh();
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setPending(false);
    }
  }
  async function changeStatus() {
    if (!target) return;
    setPending(true);
    setError("");
    setNotice("");
    try {
      await requestApi(`/api/team/${target.id}`, {
        method: "PATCH",
        body: JSON.stringify({ active: !target.active }),
      });
      setNotice(
        target.active
          ? "Đã khóa tài khoản và thu hồi các phiên đăng nhập."
          : "Đã mở khóa tài khoản.",
      );
      setTarget(null);
      router.refresh();
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      {notice && <Notice>{notice}</Notice>}
      {error && <Notice error>{error}</Notice>}
      <div className="section-heading">
        <div>
          <h2>Nhân viên</h2>
          <p>Cấp quyền phù hợp với từng vai trò trong nhóm.</p>
        </div>
        <button
          className="button primary"
          onClick={() => {
            setAdding(true);
            setError("");
          }}
        >
          <Icon name="plus" size={18} />
          Thêm nhân viên
        </button>
      </div>
      <div className="card table-wrap">
        <table>
          <thead>
            <tr>
              <th>Nhân viên</th>
              <th>Vai trò</th>
              <th>Trạng thái</th>
              <th>
                <span className="sr-only">Thao tác</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {members.map((member) => (
              <tr key={member.id}>
                <td>
                  <div className="member-cell">
                    <span className="user-avatar">{member.name.charAt(0)}</span>
                    <div>
                      <strong>
                        {member.name}
                        {member.id === actorId && (
                          <span className="you-tag">Bạn</span>
                        )}
                      </strong>
                      <small>{member.email}</small>
                    </div>
                  </div>
                </td>
                <td>
                  <Badge tone={member.role === "OWNER" ? "purple" : "muted"}>
                    {roleLabels[member.role]}
                  </Badge>
                </td>
                <td>
                  <Badge tone={member.active ? "success" : "warning"}>
                    {member.active ? "Đang hoạt động" : "Đã khóa"}
                  </Badge>
                </td>
                <td>
                  {member.id !== actorId &&
                    member.role !== "OWNER" &&
                    (member.role !== "ADMIN" || actorRole === "OWNER") && (
                      <button
                        className="button subtle small"
                        onClick={() => {
                          setTarget(member);
                          setError("");
                        }}
                      >
                        {member.active ? "Khóa tài khoản" : "Mở khóa"}
                      </button>
                    )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="form-help">
        <Icon name="shield" size={14} /> Quyền được kiểm tra ở backend. Phân
        quyền theo Page và Ad Account sẽ được bổ sung cùng Giai đoạn 2.
      </p>
      {adding && (
        <Modal
          labelledBy="member-dialog-title"
          pending={pending}
          onClose={() => setAdding(false)}
        >
          <div className="modal-header">
            <div>
              <span className="eyebrow">QUẢN LÝ TRUY CẬP</span>
              <h2 id="member-dialog-title">Thêm nhân viên</h2>
            </div>
            <button
              className="icon-button"
              onClick={() => !pending && setAdding(false)}
              aria-label="Đóng"
            >
              ×
            </button>
          </div>
          {error && <Notice error>{error}</Notice>}
          <form onSubmit={create} className="form-stack">
            <label>
              Họ và tên
              <input
                data-autofocus
                name="name"
                required
                minLength={2}
                maxLength={80}
                placeholder="Tên nhân viên"
                autoComplete="name"
              />
            </label>
            <label>
              Email
              <input
                type="email"
                name="email"
                required
                maxLength={254}
                placeholder="nhanvien@congty.vn"
                autoComplete="off"
              />
            </label>
            <label>
              Vai trò
              <select name="role" defaultValue="VIEWER">
                {Object.entries(roleLabels)
                  .filter(
                    ([role]) =>
                      role !== "OWNER" &&
                      (role !== "ADMIN" || actorRole === "OWNER"),
                  )
                  .map(([role, label]) => (
                    <option key={role} value={role}>
                      {label}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              Mật khẩu ban đầu
              <input
                type="password"
                name="password"
                required
                minLength={12}
                maxLength={128}
                autoComplete="new-password"
                placeholder="Ít nhất 12 ký tự"
              />
            </label>
            <p className="form-help">
              Tài khoản Chỉ xem và Đăng nội dung không được xem dữ liệu tài
              chính hoặc quản lý nhân viên.
            </p>
            <div className="modal-actions">
              <button
                className="button secondary"
                type="button"
                disabled={pending}
                onClick={() => setAdding(false)}
              >
                Hủy
              </button>
              <button
                className="button primary"
                type="submit"
                disabled={pending}
              >
                {pending ? "Đang tạo…" : "Tạo tài khoản"}
              </button>
            </div>
          </form>
        </Modal>
      )}
      {target && (
        <Modal
          labelledBy="status-dialog-title"
          pending={pending}
          compact
          onClose={() => setTarget(null)}
        >
          <div className="empty-icon">
            <Icon name="shield" size={26} />
          </div>
          <h2 id="status-dialog-title">
            {target.active ? "Khóa tài khoản này?" : "Mở khóa tài khoản?"}
          </h2>
          <p>
            {target.active
              ? `Nhân viên ${target.name} sẽ bị đăng xuất và không thể truy cập ứng dụng cho đến khi được mở khóa.`
              : `Nhân viên ${target.name} sẽ có thể đăng nhập lại với vai trò hiện tại.`}
          </p>
          {error && <Notice error>{error}</Notice>}
          <div className="modal-actions">
            <button
              autoFocus
              className="button secondary"
              disabled={pending}
              onClick={() => setTarget(null)}
            >
              Hủy
            </button>
            <button
              className={`button ${target.active ? "danger" : "primary"}`}
              onClick={changeStatus}
              disabled={pending}
            >
              {pending ? "Đang lưu…" : "Xác nhận"}
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
