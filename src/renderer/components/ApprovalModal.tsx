import React from "react";
import type { ApprovalRequest } from "../types";

interface ApprovalModalProps {
  request: ApprovalRequest | null;
  onRespond: (id: string, approved: boolean) => void;
}

export const ApprovalModal: React.FC<ApprovalModalProps> = ({ request, onRespond }) => {
  if (!request) return null;

  return (
    <div className="modal-overlay">
      <div className="modal-card">
        <div className="modal-header">
          <span>⚠️</span> Approval Required
        </div>
        <p className="modal-reason">LocalDevOS wants to execute:</p>
        <div className="modal-command">{request.command}</div>
        {request.reason && <p className="modal-reason">Reason: {request.reason}</p>}
        <div className="modal-actions">
          <button className="btn-secondary" onClick={() => onRespond(request.id, false)}>
            Deny
          </button>
          <button className="btn-danger" onClick={() => onRespond(request.id, true)}>
            Allow
          </button>
        </div>
      </div>
    </div>
  );
};
