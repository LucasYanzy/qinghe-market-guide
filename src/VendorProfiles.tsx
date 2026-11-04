import { useState } from 'react';
import { useLanguage } from './i18n';
import { useWorkflow, useWorkflowAction, WorkflowFeedback } from './workflowSupport';

interface ProfileFields { businessName: string; publicDescription: string; contactName: string; phone: string }
interface VendorProfile extends ProfileFields { id: number; version: number; staffManaged: boolean; pendingRequests?: number }
interface ProfileRequest {
  id: number; status: string; version: number; base_version: number; before: ProfileFields; proposed: ProfileFields;
  review_note: string; created_at: string; reviewed_at: string | null;
}
interface ProfileWorkspace { profile: VendorProfile; requests: ProfileRequest[] }
const fieldLabels: Record<keyof ProfileFields, string> = {
  businessName: '商户名称', publicDescription: '公开经营介绍', contactName: '联系人（选填）', phone: '联系电话（选填）',
};
const requestLabels: Record<string, string> = { pending: '待审核', approved: '审核通过', rejected: '未通过审核', withdrawn: '已撤回' };

export function SchoolVendorProfiles({ marketId, onSaved }: { marketId: number | null; onSaved: () => void }) {
  const { t } = useLanguage();
  const [revision, setRevision] = useState(0), [selected, setSelected] = useState(() => new URLSearchParams(window.location.search).get('vendor') ?? '');
  const reload = () => { setRevision(n => n + 1); onSaved(); };
  const vendors = useWorkflow<VendorProfile[]>(`/admin/vendor-profiles${marketId ? `?marketId=${marketId}` : ''}`, revision);
  const vendor = vendors.data?.find(v => v.id === Number(selected)) ?? vendors.data?.[0];
  return <>
    <p>{t('档案属于商户，审核通过后在其所有市场统一生效。联系人和电话仅供本人及工作人员查看。')}</p>
    <WorkflowFeedback loading={vendors.loading} error={vendors.error} retry={reload} />
    <label>{t('选择商户档案')}<select value={vendor?.id ?? ''} disabled={vendors.loading} onChange={e => setSelected(e.target.value)}>
      <option value="">{t('请选择商户')}</option>
      {vendors.data?.map(v => <option value={v.id} key={v.id}>{v.businessName}{v.pendingRequests ? ` · ${t('待审核')}` : ''}</option>)}
    </select></label>
    {vendor && !vendors.error && <VendorProfileEditor key={vendor.id} vendorId={vendor.id} onSaved={() => { setSelected(String(vendor.id)); reload(); }} />}
    {vendors.data?.length === 0 && <p>{t('当前没有商户档案。')}</p>}
  </>;
}

export function VendorProfileEditor({ vendorId, onSaved }: { vendorId?: number; onSaved?: () => void }) {
  const { t } = useLanguage();
  const [revision, setRevision] = useState(0), [success, setSuccess] = useState('');
  const reload = () => setRevision(n => n + 1);
  const isStaff = vendorId !== undefined;
  const result = useWorkflow<ProfileWorkspace>(isStaff ? `/admin/vendor-profiles/${vendorId}` : '/vendor/profile', revision);
  const action = useWorkflowAction(() => { reload(); onSaved?.(); });
  const pending = result.data?.requests.some(r => r.status === 'pending');
  const profile = result.data?.profile;
  const disabled = result.loading || action.busy || !!result.error;
  return <section className="vendor-profile-workspace" aria-label={t('商户档案工作区')}>
    <WorkflowFeedback loading={result.loading} error={result.error || action.error} retry={() => { setSuccess(''); reload(); }} />
    {success && <p className="ops-advice" role="status">{t(success)}</p>}
    {profile && <>
      <section className="panel" aria-label={t('当前生效档案')}><h3>{t('当前生效档案')}</h3><ProfileValues value={profile} /></section>
      <form className="panel form-stack" aria-label={t(isStaff ? '代提交档案变更' : '申请修改档案')} key={`${profile.id}:${profile.version}`} onSubmit={async e => {
        e.preventDefault(); setSuccess('');
        const form = new FormData(e.currentTarget);
        if (await action.run(isStaff ? `/admin/vendor-profiles/${vendorId}/requests` : '/vendor/profile-requests', {
          businessName: form.get('businessName'), publicDescription: form.get('publicDescription'),
          contactName: form.get('contactName'), phone: form.get('phone'), version: profile.version,
        })) setSuccess('档案变更已提交，审核通过后生效。');
      }}>
        <h3>{t(isStaff ? '代提交档案变更' : '申请修改档案')}</h3>
        <p>{t('公开经营介绍会展示在已确认出摊名单中。申请资质说明与私人联系方式不会公开。')}</p>
        {pending && <p role="status">{t('已有待审核变更，审核或撤回后可再次提交。')}</p>}
        <fieldset disabled={disabled || pending} className="form-stack">
          <label>{t('商户名称')}<input name="businessName" required maxLength={80} defaultValue={profile.businessName} /></label>
          <label>{t('公开经营介绍')}<textarea name="publicDescription" maxLength={1000} defaultValue={profile.publicDescription} /></label>
          <label>{t('联系人（选填）')}<input name="contactName" maxLength={80} defaultValue={profile.contactName} /></label>
          <label>{t('联系电话（选填）')}<input name="phone" type="tel" maxLength={40} defaultValue={profile.phone} /></label>
          <button className="button primary">{t('提交档案变更')}</button>
        </fieldset>
      </form>
      <section aria-label={t('档案变更记录')}><h3>{t('档案变更记录')}</h3>
        {result.data?.requests.length === 0 && <p>{t('暂无档案变更记录。')}</p>}
        <div className="workflow-cards">{result.data?.requests.map(request => <article className="panel profile-request" key={request.id}>
          <h4>#{request.id} · {t(requestLabels[request.status])}</h4>
          <p>{t('提交时间')} {request.created_at} UTC</p>
          <div className="profile-comparison"><section><h5>{t('提交时档案')}</h5><ProfileValues value={request.before} /></section><section><h5>{t('申请变更为')}</h5><ProfileValues value={request.proposed} /></section></div>
          {request.review_note && <p><strong>{t('审核意见')}：</strong>{request.review_note}</p>}
          {request.reviewed_at && <p>{t('处理时间')} {request.reviewed_at} UTC</p>}
          {request.status === 'pending' && (isStaff ? <form className="form-stack" onSubmit={async e => {
            e.preventDefault(); setSuccess(''); const form = new FormData(e.currentTarget);
            if (await action.run(`/admin/vendor-profile-requests/${request.id}`, { version: request.version, status: form.get('status'), note: form.get('note') }, 'PATCH'))
              setSuccess('档案变更审核结果已保存。');
          }}><fieldset className="form-stack" disabled={disabled}>
            <label>{t('审核决定')}<select name="status"><option value="approved">{t('审核通过')}</option><option value="rejected">{t('不予通过')}</option></select></label>
            <label>{t('审核意见')}<textarea name="note" required maxLength={500} /></label>
            <button className="button primary">{t('保存档案审核')}</button>
          </fieldset></form> : <button className="button" disabled={disabled} onClick={async () => {
            setSuccess(''); if (await action.run(`/vendor/profile-requests/${request.id}/withdraw`, { version: request.version })) setSuccess('档案变更已撤回。');
          }}>{t('撤回档案变更')}</button>)}
        </article>)}</div>
      </section>
    </>}
  </section>;
}

function ProfileValues({ value }: { value: ProfileFields }) {
  const { t } = useLanguage();
  return <dl className="profile-values">{(Object.keys(fieldLabels) as (keyof ProfileFields)[]).map(key => <div key={key}><dt>{t(fieldLabels[key])}</dt><dd>{value[key] || '—'}</dd></div>)}</dl>;
}
