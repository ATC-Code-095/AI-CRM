import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Button,
  Card,
  Descriptions,
  Input,
  message,
  Modal,
  Select,
  Space,
  Table,
  Tag,
  Typography,
  Steps,
} from 'antd'
import dayjs from 'dayjs'
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api, apiUrl, webUrl } from '../../api/client'
import { QrCode } from '../../components/QrCode'
import { t } from '../../i18n'

type SealLog = { signed: boolean; party?: string; sealName?: string; at?: string }

/** 合同用印/签署页：/contracts/:id/sign ；电子签章甲/乙方用印 */
export default function ContractSignPage() {
  const { id } = useParams()
  const qc = useQueryClient()
  const [party, setParty] = useState<'A' | 'B'>('B')
  const [sealName, setSealName] = useState<string>('')
  const [sealOpen, setSealOpen] = useState(false)
  const [newSeal, setNewSeal] = useState('')

  const { data } = useQuery({
    queryKey: ['contract-sign', id],
    queryFn: () =>
      api<{
        contractNo: string
        title: string
        status: string
        total: string
        signDate: string | null
        terms: string | null
        account?: { name: string; phone?: string; address?: string }
        lines: { id: string; name: string; qty: string; unitPrice: string; amount: string }[]
      }>(`/contracts/${id}`),
    enabled: !!id,
    retry: false,
  })

  const esignQ = useQuery({
    queryKey: ['contract-esign', id],
    queryFn: () =>
      api<{
        a: SealLog
        b: SealLog
        bothSigned: boolean
        status: string
        logs: string[]
      }>(`/contracts/${id}/esign`),
    enabled: !!id,
    retry: false,
  })

  const coQ = useQuery({
    queryKey: ['change-orders', id],
    enabled: !!id,
    queryFn: () =>
      api<{
        items: {
          id: string
          title: string
          amountDelta: string
          status: string
          createdAt: string
        }[]
      }>(`/change-orders?contractId=${id}`),
    retry: false,
  })

  const histQ = useQuery({
    queryKey: ['contract-history', id],
    enabled: !!id,
    queryFn: () =>
      api<{
        items: {
          id: string
          at: string
          action: string
          before?: Record<string, unknown>
          after?: Record<string, unknown>
        }[]
      }>(`/audit-logs?entity=CONTRACT&q=${id}&pageSize=10`),
    retry: false,
  })

  const filesQ = useQuery({
    queryKey: ['contract-files', id],
    enabled: !!id,
    queryFn: async () => {
      const rows = await api<{ id: string; fileName: string; size: number }[]>(
        `/files/entity/CONTRACT/${id}`,
      )
      return { items: Array.isArray(rows) ? rows : [] }
    },
    retry: false,
  })

  const sealsQ = useQuery({
    queryKey: ['esign-seals'],
    queryFn: () =>
      api<{ items: { id: string; name: string; type?: string; party?: string }[] }>('/esign/seals'),
    retry: false,
  })

  const esignM = useMutation({
    mutationFn: (p: { party: 'A' | 'B'; sealName?: string }) =>
      api(`/contracts/${id}/esign`, { method: 'POST', body: JSON.stringify(p) }),
    onSuccess: () => {
      message.success(t('contracts.sealingComplete'))
      void qc.invalidateQueries({ queryKey: ['contract-esign', id] })
      void qc.invalidateQueries({ queryKey: ['contract-sign', id] })
    },
    onError: (e: Error) => message.error(e.message),
  })

  const requestM = useMutation({
    mutationFn: () => api(`/contracts/${id}/request-sign`, { method: 'POST' }),
    onSuccess: () => {
      message.success(t('contracts.eSignStarted'))
      void qc.invalidateQueries({ queryKey: ['contract-sign', id] })
    },
    onError: (e: Error) => message.error(e.message),
  })

  const confirmM = useMutation({
    mutationFn: () => api(`/contracts/${id}/confirm-sign`, { method: 'POST' }),
    onSuccess: () => {
      message.success(t('contracts.contractIsNowActive'))
      void qc.invalidateQueries({ queryKey: ['contract-sign', id] })
      void qc.invalidateQueries({ queryKey: ['contracts'] })
    },
    onError: (e: Error) => message.error(e.message),
  })

  const createSealM = useMutation({
    mutationFn: (name: string) =>
      api<{ name: string }>('/esign/seals', {
        method: 'POST',
        body: JSON.stringify({ name, type: 'CONTRACT', party }),
      }),
    onSuccess: (r) => {
      message.success(t('contracts.sealAdded'))
      setSealOpen(false)
      setNewSeal('')
      setSealName(r.name)
      void qc.invalidateQueries({ queryKey: ['esign-seals'] })
    },
    onError: (e: Error) => message.error(e.message),
  })

  if (!data) return null
  const esign = esignQ.data
  const sealOptions = (sealsQ.data?.items ?? []).map((s) => ({
    value: s.name,
    label: `${s.name}${s.type ? ` · ${s.type}` : ''}`,
  }))

  const SealBox = ({ log, label, p }: { log?: SealLog; label: string; p: 'A' | 'B' }) => (
    <div style={{ textAlign: 'center' }}>
      <div>{label}</div>
      <div
        style={{
          width: 200,
          height: 110,
          border: log?.signed ? '2px solid #16a34a' : '2px dashed #94a3b8',
          borderRadius: 8,
          marginTop: 8,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          color: log?.signed ? '#16a34a' : '#94a3b8',
          fontSize: 12,
          background: log?.signed ? '#f0fdf4' : '#fafafa',
        }}
      >
        {log?.signed ? (
          <>
            <div style={{ fontSize: 16, fontWeight: 700 }}>{t('contracts.sealed')}</div>
            <div>{log.sealName}</div>
            <div style={{ marginTop: 4, fontSize: 11 }}>
              {log.at ? dayjs(log.at).format('YYYY-MM-DD HH:mm') : ''}
            </div>
          </>
        ) : (
          <span>{t('contracts.sealArea', { p })}</span>
        )}
      </div>
      {!log?.signed && (
        <Button
          size="small"
          style={{ marginTop: 8 }}
          type="primary"
          ghost
          onClick={() => {
            setParty(p)
            if (!sealName && sealOptions[0]) setSealName(sealOptions[0].value)
            esignM.mutate({ party: p, sealName: sealName || undefined })
          }}
          loading={esignM.isPending && party === p}
        >{t('contracts.eSeal')}</Button>
      )}
    </div>
  )

  return (
    <div style={{ maxWidth: 860, margin: '0 auto', padding: 24, background: '#fff' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          marginBottom: 16,
          flexWrap: 'wrap',
          gap: 8,
        }}
      >
        <div>
          <Typography.Title level={3} style={{ margin: 0 }}>{t('contracts.contractSigningSealing')}</Typography.Title>
          <Typography.Text type="secondary">
            {data.contractNo}
            {esign?.bothSigned ? (
              <Tag color="green" style={{ marginLeft: 8 }}>{t('contracts.sealedByBothParties')}</Tag>
            ) : (
              <Tag color="orange" style={{ marginLeft: 8 }}>{t('contracts.pendingSeal')}</Tag>
            )}
          </Typography.Text>
        </div>
        <Space>
          <Link to={`/contracts/${id}/print`}>
            <Button
            onClick={() => {
              Modal.info({
                title: t('contracts.scanToSignContract'),
                content: (
                  <div style={{ textAlign: 'center' }}>
                    <QrCode value={webUrl()} size={160} />
                    <div style={{ marginTop: 12, fontSize: 12, color: '#64748b', wordBreak: 'break-all' }}>
                      {webUrl()}
                    </div>
                    <div style={{ marginTop: 8, fontSize: 12, color: '#94a3b8' }}>{t('contracts.scanWithYourPhone')}</div>
                  </div>
                ),
              })
            }}
          >{t('contracts.signingQrCode')}</Button>
          <Button>{t('contracts.printContract')}</Button>
          </Link>
          <Button onClick={() => requestM.mutate()} loading={requestM.isPending}>{t('contracts.startESign')}</Button>
          <Button
            type="primary"
            onClick={() => confirmM.mutate()}
            loading={confirmM.isPending}
            disabled={!esign?.bothSigned && data.status !== 'DRAFT'}
          >{t('contracts.confirmActivation')}</Button>
        </Space>
      </div>
      <Card size="small" style={{ marginBottom: 16 }}>
        <Steps
          size="small"
          current={
            esign?.bothSigned ? 2 : esign?.a?.signed || esign?.b?.signed ? 1 : 0
          }
          items={[
            { title: t('contracts.pendingSeal') },
            { title: t('contracts.signing') },
            { title: t('contracts.signedByBoth') },
          ]}
          style={{ marginBottom: 8 }}
        />
        <div style={{ fontSize: 12, color: '#64748b' }}>
          {esign?.bothSigned
            ? t('contracts.bothPartiesHaveSealed')
            : esign?.a?.signed || esign?.b?.signed
              ? t('contracts.onePartySealedWaiting')
              : t('contracts.waitingForBothParties')}
        </div>
        <Steps
          size="small"
          current={
            esign?.bothSigned ? 2 : esign?.a?.signed || esign?.b?.signed ? 1 : 0
          }
          items={[
            { title: t('contracts.pendingSeal') },
            { title: t('contracts.signing') },
            { title: t('contracts.signedByBoth') },
          ]}
          style={{ marginBottom: 8 }}
        />
        <div style={{ fontSize: 12, color: '#64748b' }}>
          {esign?.bothSigned
            ? t('contracts.bothPartiesHaveSealed')
            : esign?.a?.signed || esign?.b?.signed
              ? t('contracts.onePartySealedWaiting')
              : t('contracts.waitingForBothParties')}
        </div>
        <Steps
          size="small"
          current={
            esign?.bothSigned ? 2 : esign?.a?.signed || esign?.b?.signed ? 1 : 0
          }
          items={[
            { title: t('contracts.pendingSeal') },
            { title: t('contracts.signing') },
            { title: t('contracts.signedByBoth') },
          ]}
          style={{ marginBottom: 8 }}
        />
        <div style={{ fontSize: 12, color: '#64748b' }}>
          {esign?.bothSigned
            ? t('contracts.bothPartiesHaveSealed')
            : esign?.a?.signed || esign?.b?.signed
              ? t('contracts.onePartySealedWaiting')
              : t('contracts.waitingForBothParties')}
        </div>
        <Steps
          size="small"
          current={
            esign?.bothSigned ? 2 : esign?.a?.signed || esign?.b?.signed ? 1 : 0
          }
          items={[
            { title: t('contracts.pendingSeal') },
            { title: t('contracts.signing') },
            { title: t('contracts.signedByBoth') },
          ]}
          style={{ marginBottom: 8 }}
        />
        <div style={{ fontSize: 12, color: '#64748b' }}>
          {esign?.bothSigned
            ? t('contracts.bothPartiesHaveSealed')
            : esign?.a?.signed || esign?.b?.signed
              ? t('contracts.onePartySealedWaiting')
              : t('contracts.waitingForBothParties')}
        </div>
        <Steps
          size="small"
          current={
            esign?.bothSigned ? 2 : esign?.a?.signed || esign?.b?.signed ? 1 : 0
          }
          items={[
            { title: t('contracts.pendingSeal') },
            { title: t('contracts.signing') },
            { title: t('contracts.signedByBoth') },
          ]}
          style={{ marginBottom: 8 }}
        />
        <div style={{ fontSize: 12, color: '#64748b' }}>
          {esign?.bothSigned
            ? t('contracts.bothPartiesHaveSealed')
            : esign?.a?.signed || esign?.b?.signed
              ? t('contracts.onePartySealedWaiting')
              : t('contracts.waitingForBothParties')}
        </div>
        <Steps
          size="small"
          current={
            esign?.bothSigned ? 2 : esign?.a?.signed || esign?.b?.signed ? 1 : 0
          }
          items={[
            { title: t('contracts.pendingSeal') },
            { title: t('contracts.signing') },
            { title: t('contracts.signedByBoth') },
          ]}
          style={{ marginBottom: 8 }}
        />
        <div style={{ fontSize: 12, color: '#64748b' }}>
          {esign?.bothSigned
            ? t('contracts.bothPartiesHaveSealed')
            : esign?.a?.signed || esign?.b?.signed
              ? t('contracts.onePartySealedWaiting')
              : t('contracts.waitingForBothParties')}
        </div>
        <Steps
          size="small"
          current={
            esign?.bothSigned ? 2 : esign?.a?.signed || esign?.b?.signed ? 1 : 0
          }
          items={[
            { title: t('contracts.pendingSeal') },
            { title: t('contracts.signing') },
            { title: t('contracts.signedByBoth') },
          ]}
          style={{ marginBottom: 8 }}
        />
        <div style={{ fontSize: 12, color: '#64748b' }}>
          {esign?.bothSigned
            ? t('contracts.bothPartiesHaveSealed')
            : esign?.a?.signed || esign?.b?.signed
              ? t('contracts.onePartySealedWaiting')
              : t('contracts.waitingForBothParties')}
        </div>
        <Steps
          size="small"
          current={
            esign?.bothSigned ? 2 : esign?.a?.signed || esign?.b?.signed ? 1 : 0
          }
          items={[
            { title: t('contracts.pendingSeal') },
            { title: t('contracts.signing') },
            { title: t('contracts.signedByBoth') },
          ]}
          style={{ marginBottom: 8 }}
        />
        <div style={{ fontSize: 12, color: '#64748b' }}>
          {esign?.bothSigned
            ? t('contracts.bothPartiesHaveSealed')
            : esign?.a?.signed || esign?.b?.signed
              ? t('contracts.onePartySealedWaiting')
              : t('contracts.waitingForBothParties')}
        </div>
        <Steps
          size="small"
          current={
            esign?.bothSigned ? 2 : esign?.a?.signed || esign?.b?.signed ? 1 : 0
          }
          items={[
            { title: t('contracts.pendingSeal') },
            { title: t('contracts.signing') },
            { title: t('contracts.signedByBoth') },
          ]}
          style={{ marginBottom: 8 }}
        />
        <div style={{ fontSize: 12, color: '#64748b' }}>
          {esign?.bothSigned
            ? t('contracts.bothPartiesHaveSealed')
            : esign?.a?.signed || esign?.b?.signed
              ? t('contracts.onePartySealedWaiting')
              : t('contracts.waitingForBothParties')}
        </div>
        <Steps
          size="small"
          current={
            esign?.bothSigned ? 2 : esign?.a?.signed || esign?.b?.signed ? 1 : 0
          }
          items={[
            { title: t('contracts.pendingSeal') },
            { title: t('contracts.signing') },
            { title: t('contracts.signedByBoth') },
          ]}
          style={{ marginBottom: 8 }}
        />
        <div style={{ fontSize: 12, color: '#64748b' }}>
          {esign?.bothSigned
            ? t('contracts.bothPartiesHaveSealed')
            : esign?.a?.signed || esign?.b?.signed
              ? t('contracts.onePartySealedWaiting')
              : t('contracts.waitingForBothParties')}
        </div>
        <Steps
          size="small"
          current={
            esign?.bothSigned ? 2 : esign?.a?.signed || esign?.b?.signed ? 1 : 0
          }
          items={[
            { title: t('contracts.pendingSeal') },
            { title: t('contracts.signing') },
            { title: t('contracts.signedByBoth') },
          ]}
          style={{ marginBottom: 8 }}
        />
        <div style={{ fontSize: 12, color: '#64748b' }}>
          {esign?.bothSigned
            ? t('contracts.bothPartiesHaveSealed')
            : esign?.a?.signed || esign?.b?.signed
              ? t('contracts.onePartySealedWaiting')
              : t('contracts.waitingForBothParties')}
        </div>
        <Steps
          size="small"
          current={
            esign?.bothSigned ? 2 : esign?.a?.signed || esign?.b?.signed ? 1 : 0
          }
          items={[
            { title: t('contracts.pendingSeal') },
            { title: t('contracts.signing') },
            { title: t('contracts.signedByBoth') },
          ]}
          style={{ marginBottom: 8 }}
        />
        <div style={{ fontSize: 12, color: '#64748b' }}>
          {esign?.bothSigned
            ? t('contracts.bothPartiesHaveSealed')
            : esign?.a?.signed || esign?.b?.signed
              ? t('contracts.onePartySealedWaiting')
              : t('contracts.waitingForBothParties')}
        </div>
        <Steps
          size="small"
          current={
            esign?.bothSigned ? 2 : esign?.a?.signed || esign?.b?.signed ? 1 : 0
          }
          items={[
            { title: t('contracts.pendingSeal') },
            { title: t('contracts.signing') },
            { title: t('contracts.signedByBoth') },
          ]}
          style={{ marginBottom: 8 }}
        />
        <div style={{ fontSize: 12, color: '#64748b' }}>
          {esign?.bothSigned
            ? t('contracts.bothPartiesHaveSealed')
            : esign?.a?.signed || esign?.b?.signed
              ? t('contracts.onePartySealedWaiting')
              : t('contracts.waitingForBothParties')}
        </div>
        <Steps
          size="small"
          current={
            esign?.bothSigned ? 2 : esign?.a?.signed || esign?.b?.signed ? 1 : 0
          }
          items={[
            { title: t('contracts.pendingSeal') },
            { title: t('contracts.signing') },
            { title: t('contracts.signedByBoth') },
          ]}
          style={{ marginBottom: 8 }}
        />
        <div style={{ fontSize: 12, color: '#64748b' }}>
          {esign?.bothSigned
            ? t('contracts.bothPartiesHaveSealed')
            : esign?.a?.signed || esign?.b?.signed
              ? t('contracts.onePartySealedWaiting')
              : t('contracts.waitingForBothParties')}
        </div>
        <Steps
          size="small"
          current={
            esign?.bothSigned ? 2 : esign?.a?.signed || esign?.b?.signed ? 1 : 0
          }
          items={[
            { title: t('contracts.pendingSeal') },
            { title: t('contracts.signing') },
            { title: t('contracts.signedByBoth') },
          ]}
          style={{ marginBottom: 8 }}
        />
        <div style={{ fontSize: 12, color: '#64748b' }}>
          {esign?.bothSigned
            ? t('contracts.bothPartiesHaveSealed')
            : esign?.a?.signed || esign?.b?.signed
              ? t('contracts.onePartySealedWaiting')
              : t('contracts.waitingForBothParties')}
        </div>
        <Steps
          size="small"
          current={
            esign?.bothSigned ? 2 : esign?.a?.signed || esign?.b?.signed ? 1 : 0
          }
          items={[
            { title: t('contracts.pendingSeal') },
            { title: t('contracts.signing') },
            { title: t('contracts.signedByBoth') },
          ]}
          style={{ marginBottom: 8 }}
        />
        <div style={{ fontSize: 12, color: '#64748b' }}>
          {esign?.bothSigned
            ? t('contracts.bothPartiesHaveSealed')
            : esign?.a?.signed || esign?.b?.signed
              ? t('contracts.onePartySealedWaiting')
              : t('contracts.waitingForBothParties')}
        </div>
        <Steps
          size="small"
          current={
            esign?.bothSigned ? 2 : esign?.a?.signed || esign?.b?.signed ? 1 : 0
          }
          items={[
            { title: t('contracts.pendingSeal') },
            { title: t('contracts.signing') },
            { title: t('contracts.signedByBoth') },
          ]}
          style={{ marginBottom: 8 }}
        />
        <div style={{ fontSize: 12, color: '#64748b' }}>
          {esign?.bothSigned
            ? t('contracts.bothPartiesHaveSealed')
            : esign?.a?.signed || esign?.b?.signed
              ? t('contracts.onePartySealedWaiting')
              : t('contracts.waitingForBothParties')}
        </div>
        <Steps
          size="small"
          current={
            esign?.bothSigned ? 2 : esign?.a?.signed || esign?.b?.signed ? 1 : 0
          }
          items={[
            { title: t('contracts.pendingSeal') },
            { title: t('contracts.signing') },
            { title: t('contracts.signedByBoth') },
          ]}
          style={{ marginBottom: 8 }}
        />
        <div style={{ fontSize: 12, color: '#64748b' }}>
          {esign?.bothSigned
            ? t('contracts.bothPartiesHaveSealed')
            : esign?.a?.signed || esign?.b?.signed
              ? t('contracts.onePartySealedWaiting')
              : t('contracts.waitingForBothParties')}
        </div>
        <Steps
          size="small"
          current={
            esign?.bothSigned ? 2 : esign?.a?.signed || esign?.b?.signed ? 1 : 0
          }
          items={[
            { title: t('contracts.pendingSeal') },
            { title: t('contracts.signing') },
            { title: t('contracts.signedByBoth') },
          ]}
          style={{ marginBottom: 8 }}
        />
        <div style={{ fontSize: 12, color: '#64748b' }}>
          {esign?.bothSigned
            ? t('contracts.bothPartiesHaveSealed')
            : esign?.a?.signed || esign?.b?.signed
              ? t('contracts.onePartySealedWaiting')
              : t('contracts.waitingForBothParties')}
        </div>
        <Steps
          size="small"
          current={
            esign?.bothSigned ? 2 : esign?.a?.signed || esign?.b?.signed ? 1 : 0
          }
          items={[
            { title: t('contracts.pendingSeal') },
            { title: t('contracts.signing') },
            { title: t('contracts.signedByBoth') },
          ]}
          style={{ marginBottom: 8 }}
        />
        <div style={{ fontSize: 12, color: '#64748b' }}>
          {esign?.bothSigned
            ? t('contracts.bothPartiesHaveSealed')
            : esign?.a?.signed || esign?.b?.signed
              ? t('contracts.onePartySealedWaiting')
              : t('contracts.waitingForBothParties')}
        </div>
        <Steps
          size="small"
          current={
            esign?.bothSigned ? 2 : esign?.a?.signed || esign?.b?.signed ? 1 : 0
          }
          items={[
            { title: t('contracts.pendingSeal') },
            { title: t('contracts.signing') },
            { title: t('contracts.signedByBoth') },
          ]}
          style={{ marginBottom: 8 }}
        />
        <div style={{ fontSize: 12, color: '#64748b' }}>
          {esign?.bothSigned
            ? t('contracts.bothPartiesHaveSealed')
            : esign?.a?.signed || esign?.b?.signed
              ? t('contracts.onePartySealedWaiting')
              : t('contracts.waitingForBothParties')}
        </div>
        <Steps
          size="small"
          current={
            esign?.bothSigned ? 2 : esign?.a?.signed || esign?.b?.signed ? 1 : 0
          }
          items={[
            { title: t('contracts.pendingSeal') },
            { title: t('contracts.signing') },
            { title: t('contracts.signedByBoth') },
          ]}
          style={{ marginBottom: 8 }}
        />
        <div style={{ fontSize: 12, color: '#64748b' }}>
          {esign?.bothSigned
            ? t('contracts.bothPartiesHaveSealed')
            : esign?.a?.signed || esign?.b?.signed
              ? t('contracts.onePartySealedWaiting')
              : t('contracts.waitingForBothParties')}
        </div>
        <Steps
          size="small"
          current={
            esign?.bothSigned ? 2 : esign?.a?.signed || esign?.b?.signed ? 1 : 0
          }
          items={[
            { title: t('contracts.pendingSeal') },
            { title: t('contracts.signing') },
            { title: t('contracts.signedByBoth') },
          ]}
          style={{ marginBottom: 8 }}
        />
        <div style={{ fontSize: 12, color: '#64748b' }}>
          {esign?.bothSigned
            ? t('contracts.bothPartiesHaveSealed')
            : esign?.a?.signed || esign?.b?.signed
              ? t('contracts.onePartySealedWaiting')
              : t('contracts.waitingForBothParties')}
        </div>
        <Steps
          size="small"
          current={
            esign?.bothSigned ? 2 : esign?.a?.signed || esign?.b?.signed ? 1 : 0
          }
          items={[
            { title: t('contracts.pendingSeal') },
            { title: t('contracts.signing') },
            { title: t('contracts.signedByBoth') },
          ]}
          style={{ marginBottom: 8 }}
        />
        <div style={{ fontSize: 12, color: '#64748b' }}>
          {esign?.bothSigned
            ? t('contracts.bothPartiesHaveSealed')
            : esign?.a?.signed || esign?.b?.signed
              ? t('contracts.onePartySealedWaiting')
              : t('contracts.waitingForBothParties')}
        </div>
        <Steps
          size="small"
          current={
            esign?.bothSigned ? 2 : esign?.a?.signed || esign?.b?.signed ? 1 : 0
          }
          items={[
            { title: t('contracts.pendingSeal') },
            { title: t('contracts.signing') },
            { title: t('contracts.signedByBoth') },
          ]}
          style={{ marginBottom: 8 }}
        />
        <div style={{ fontSize: 12, color: '#64748b' }}>
          {esign?.bothSigned
            ? t('contracts.bothPartiesHaveSealed')
            : esign?.a?.signed || esign?.b?.signed
              ? t('contracts.onePartySealedWaiting')
              : t('contracts.waitingForBothParties')}
        </div>
        <Steps
          size="small"
          current={
            esign?.bothSigned ? 2 : esign?.a?.signed || esign?.b?.signed ? 1 : 0
          }
          items={[
            { title: t('contracts.pendingSeal') },
            { title: t('contracts.signing') },
            { title: t('contracts.signedByBoth') },
          ]}
          style={{ marginBottom: 8 }}
        />
        <div style={{ fontSize: 12, color: '#64748b' }}>
          {esign?.bothSigned
            ? t('contracts.bothPartiesHaveSealed')
            : esign?.a?.signed || esign?.b?.signed
              ? t('contracts.onePartySealedWaiting')
              : t('contracts.waitingForBothParties')}
        </div>
        <Steps
          size="small"
          current={
            esign?.bothSigned ? 2 : esign?.a?.signed || esign?.b?.signed ? 1 : 0
          }
          items={[
            { title: t('contracts.pendingSeal') },
            { title: t('contracts.signing') },
            { title: t('contracts.signedByBoth') },
          ]}
          style={{ marginBottom: 8 }}
        />
        <div style={{ fontSize: 12, color: '#64748b' }}>
          {esign?.bothSigned
            ? t('contracts.bothPartiesHaveSealed')
            : esign?.a?.signed || esign?.b?.signed
              ? t('contracts.onePartySealedWaiting')
              : t('contracts.waitingForBothParties')}
        </div>
        <Steps
          size="small"
          current={
            esign?.bothSigned ? 2 : esign?.a?.signed || esign?.b?.signed ? 1 : 0
          }
          items={[
            { title: t('contracts.pendingSeal') },
            { title: t('contracts.signing') },
            { title: t('contracts.signedByBoth') },
          ]}
          style={{ marginBottom: 8 }}
        />
        <div style={{ fontSize: 12, color: '#64748b' }}>
          {esign?.bothSigned
            ? t('contracts.bothPartiesHaveSealed')
            : esign?.a?.signed || esign?.b?.signed
              ? t('contracts.onePartySealedWaiting')
              : t('contracts.waitingForBothParties')}
        </div>
        <Steps
          size="small"
          current={
            esign?.bothSigned ? 2 : esign?.a?.signed || esign?.b?.signed ? 1 : 0
          }
          items={[
            { title: t('contracts.pendingSeal') },
            { title: t('contracts.signing') },
            { title: t('contracts.signedByBoth') },
          ]}
          style={{ marginBottom: 8 }}
        />
        <div style={{ fontSize: 12, color: '#64748b' }}>
          {esign?.bothSigned
            ? t('contracts.bothPartiesHaveSealed')
            : esign?.a?.signed || esign?.b?.signed
              ? t('contracts.onePartySealedWaiting')
              : t('contracts.waitingForBothParties')}
        </div>
        <Steps
          size="small"
          current={
            esign?.bothSigned ? 2 : esign?.a?.signed || esign?.b?.signed ? 1 : 0
          }
          items={[
            { title: t('contracts.pendingSeal') },
            { title: t('contracts.signing') },
            { title: t('contracts.signedByBoth') },
          ]}
          style={{ marginBottom: 8 }}
        />
        <div style={{ fontSize: 12, color: '#64748b' }}>
          {esign?.bothSigned
            ? t('contracts.bothPartiesHaveSealed')
            : esign?.a?.signed || esign?.b?.signed
              ? t('contracts.onePartySealedWaiting')
              : t('contracts.waitingForBothParties')}
        </div>
        <Steps
          size="small"
          current={
            esign?.bothSigned ? 2 : esign?.a?.signed || esign?.b?.signed ? 1 : 0
          }
          items={[
            { title: t('contracts.pendingSeal') },
            { title: t('contracts.signing') },
            { title: t('contracts.signedByBoth') },
          ]}
          style={{ marginBottom: 8 }}
        />
        <div style={{ fontSize: 12, color: '#64748b' }}>
          {esign?.bothSigned
            ? t('contracts.bothPartiesHaveSealed')
            : esign?.a?.signed || esign?.b?.signed
              ? t('contracts.onePartySealedWaiting')
              : t('contracts.waitingForBothParties')}
        </div>
        <Steps
          size="small"
          current={
            esign?.bothSigned ? 2 : esign?.a?.signed || esign?.b?.signed ? 1 : 0
          }
          items={[
            { title: t('contracts.pendingSeal') },
            { title: t('contracts.signing') },
            { title: t('contracts.signedByBoth') },
          ]}
          style={{ marginBottom: 8 }}
        />
        <div style={{ fontSize: 12, color: '#64748b' }}>
          {esign?.bothSigned
            ? t('contracts.bothPartiesHaveSealed')
            : esign?.a?.signed || esign?.b?.signed
              ? t('contracts.onePartySealedWaiting')
              : t('contracts.waitingForBothParties')}
        </div>
        <Steps
          size="small"
          current={
            esign?.bothSigned ? 2 : esign?.a?.signed || esign?.b?.signed ? 1 : 0
          }
          items={[
            { title: t('contracts.pendingSeal') },
            { title: t('contracts.signing') },
            { title: t('contracts.signedByBoth') },
          ]}
          style={{ marginBottom: 8 }}
        />
        <div style={{ fontSize: 12, color: '#64748b' }}>
          {esign?.bothSigned
            ? t('contracts.bothPartiesHaveSealed')
            : esign?.a?.signed || esign?.b?.signed
              ? t('contracts.onePartySealedWaiting')
              : t('contracts.waitingForBothParties')}
        </div>
        <Steps
          size="small"
          current={
            esign?.bothSigned ? 2 : esign?.a?.signed || esign?.b?.signed ? 1 : 0
          }
          items={[
            { title: t('contracts.pendingSeal') },
            { title: t('contracts.signing') },
            { title: t('contracts.signedByBoth') },
          ]}
          style={{ marginBottom: 8 }}
        />
        <div style={{ fontSize: 12, color: '#64748b' }}>
          {esign?.bothSigned
            ? t('contracts.bothPartiesHaveSealed')
            : esign?.a?.signed || esign?.b?.signed
              ? t('contracts.onePartySealedWaiting')
              : t('contracts.waitingForBothParties')}
        </div>
        <Descriptions column={2} size="small">
          <Descriptions.Item label={t('contracts.partyA')}>{data.account?.name ?? '-'}</Descriptions.Item>
          <Descriptions.Item label={t('audit.field.title')}>{data.title}</Descriptions.Item>
          <Descriptions.Item label={t('audit.field.total')}>{data.total}</Descriptions.Item>
          <Descriptions.Item label={t('audit.field.status')}>{data.status}</Descriptions.Item>
          {data.account?.phone ? (
            <Descriptions.Item label={t('contracts.customerPhone')}>{data.account.phone}</Descriptions.Item>
          ) : null}
          {data.account?.address ? (
            <Descriptions.Item label={t('contracts.customerAddress')}>{data.account.address}</Descriptions.Item>
          ) : null}
        </Descriptions>
      </Card>
      <Table
        rowKey="id"
        size="small"
        pagination={false}
        dataSource={data.lines}
        columns={[
          { title: t('nav.projects'), dataIndex: 'name' },
          { title: t('common.qty'), dataIndex: 'qty' },
          { title: t('common.unitPrice'), dataIndex: 'unitPrice' },
          { title: t('audit.field.amount'), dataIndex: 'amount' },
        ]}
      />
      {data.terms ? (
        <div style={{ marginTop: 16, padding: 12, background: '#f8fafc', borderRadius: 8 }}>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>{t('contracts.contractTerms')}</div>
          <div style={{ whiteSpace: 'pre-wrap', fontSize: 13, lineHeight: 1.8 }}>{data.terms}</div>
        </div>
      ) : null}

      <Card size="small" style={{ marginTop: 16 }}>
        <Space wrap style={{ marginBottom: 8 }}>
          <span>{t('contracts.seal')}</span>
          <Select
            style={{ width: 220 }}
            placeholder={t('contracts.selectSeal')}
            value={sealName || undefined}
            options={sealOptions}
            onChange={(v: string) => setSealName(v)}
            allowClear
          />
          <Button size="small" onClick={() => setSealOpen(true)}>{t('contracts.newSeal')}</Button>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>{t('contracts.eSealRecordsAre')}</Typography.Text>
        </Space>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 24, padding: '0 24px' }}>
          <SealBox log={esign?.a} label={t('contracts.partyASeal')} p="A" />
          <SealBox log={esign?.b} label={t('contracts.partyBSeal')} p="B" />
        </div>
        {esign?.logs?.length ? (
          <div style={{ marginTop: 16, fontSize: 12, color: '#646A73' }}>{t('contracts.sealRecords')}{esign.logs.map((l) => (
              <div key={l}>{l}</div>
            ))}
          </div>
        ) : null}
      </Card>

      <Card size="small" style={{ marginTop: 16 }} title={t('contracts.contractAttachments')}>
        <Space wrap style={{ marginBottom: 8 }}>
          <Button
            size="small"
            type="primary"
            ghost
            onClick={() => {
              const input = document.createElement('input')
              input.type = 'file'
              input.multiple = true
              input.accept = '.pdf,.doc,.docx,.png,.jpg,.jpeg'
              input.onchange = async () => {
                const files = Array.from(input.files ?? [])
                let ok = 0
                for (const f of files) {
                  const fd = new FormData()
                  fd.append('file', f)
                  fd.append('entityType', 'CONTRACT')
                  fd.append('entityId', String(id))
                  fd.append('fileName', f.name)
                  const res = await fetch(apiUrl('/api/v1/files'), {
                    method: 'POST',
                    headers: {
                      Authorization: `Bearer ${localStorage.getItem('access_token') ?? ''}`,
                    },
                    body: fd,
                  })
                  const body = await res.json()
                  if (body.code === 0) ok++
                  else message.error(`${f.name}: ${body.message || t('common.uploadFailed')}`)
                }
                if (ok) message.success(t('contracts.uploadedAttachments', { ok, length: files.length }))
                void qc.invalidateQueries({ queryKey: ['contract-files', id] })
              }
              input.click()
            }}
          >{t('contracts.batchUploadAttachments')}</Button>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>{t('contracts.uploadSignedAndSealed')}</Typography.Text>
        </Space>
        <div>
          {(filesQ.data?.items ?? []).map((f) => (
            <div key={f.id} style={{ fontSize: 12, padding: '3px 0' }}>
              {f.fileName}{' '}
              <Button
                size="small"
                type="link"
                onClick={() => {
                  void fetch(apiUrl(`/api/v1/files/${f.id}`), {
                    headers: { Authorization: `Bearer ${localStorage.getItem('access_token') ?? ''}` },
                  })
                    .then((r) => r.blob())
                    .then((blob) => {
                      const url = URL.createObjectURL(blob)
                      window.open(url, '_blank')
                    })
                }}
              >{t('contracts.preview')}</Button>
              <Button
                size="small"
                type="link"
                onClick={() => {
                  void fetch(apiUrl(`/api/v1/files/${f.id}`), {
                    headers: { Authorization: `Bearer ${localStorage.getItem('access_token') ?? ''}` },
                  })
                    .then((r) => r.blob())
                    .then((blob) => {
                      const url = URL.createObjectURL(blob)
                      const a = document.createElement('a')
                      a.href = url
                      a.download = f.fileName
                      a.click()
                      URL.revokeObjectURL(url)
                    })
                }}
              >{t('common.download')}</Button>
            </div>
          ))}
          {(filesQ.data?.items ?? []).length === 0 ? (
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>{t('contracts.noAttachments')}</Typography.Text>
          ) : null}
        </div>
      </Card>

      <Card size="small" style={{ marginTop: 16 }} title={t('contracts.contractChangeOrder')}>
        <Table
          rowKey="id"
          size="small"
          pagination={{ pageSize: 5 }}
          loading={coQ.isLoading}
          dataSource={coQ.data?.items ?? []}
          columns={[
            {
              title: t('audit.field.title'),
              dataIndex: 'title',
              render: (v: string) => v,
            },
            {
              title: t('contracts.amountChange'),
              dataIndex: 'amountDelta',
              width: 100,
              render: (v: string) => (
                <span style={{ color: Number(v) >= 0 ? '#0d9488' : '#dc2626' }}>{v}</span>
              ),
            },
            {
              title: t('audit.field.status'),
              dataIndex: 'status',
              width: 90,
              render: (v: string) => (
                <Tag
                  color={v === 'APPROVED' ? 'green' : v === 'REJECTED' ? 'red' : 'orange'}
                >
                  {v}
                </Tag>
              ),
            },
            {
              title: t('common.time'),
              dataIndex: 'createdAt',
              width: 100,
              render: (v: string) => dayjs(v).format('MM-DD'),
            },
          ]}
        />
      </Card>
      <Card size="small" style={{ marginTop: 16 }} title={t('contracts.contractChangeHistory')}>
        <Table
          rowKey="id"
          size="small"
          pagination={{ pageSize: 5 }}
          loading={histQ.isLoading}
          dataSource={histQ.data?.items ?? []}
          columns={[
            {
              title: t('common.time'),
              dataIndex: 'at',
              width: 130,
              render: (v: string) => dayjs(v).format('MM-DD HH:mm'),
            },
            {
              title: t('common.action'),
              dataIndex: 'action',
              width: 90,
              render: (v: string) => <Tag>{v}</Tag>,
            },
            {
              title: t('contracts.changeSummary'),
              render: (_: unknown, r: { before?: Record<string, unknown>; after?: Record<string, unknown> }) => {
                const b = r.before ?? {}
                const a = r.after ?? {}
                const keys = Object.keys({ ...b, ...a }).slice(0, 4)
                return keys.map((k) => `${k}: ${b[k] ?? '∅'} → ${a[k] ?? '∅'}`).join('；')
              },
            },
          ]}
        />
      </Card>

      <Modal
        title={t('contracts.newESeal')}
        open={sealOpen}
        onCancel={() => setSealOpen(false)}
        onOk={() => {
          if (!newSeal.trim()) {
            message.warning(t('contracts.pleaseEnterASeal'))
            return
          }
          createSealM.mutate(newSeal.trim())
        }}
        confirmLoading={createSealM.isPending}
      >
        <Input
          placeholder={t('contracts.eGPartyB')}
          value={newSeal}
          onChange={(e) => setNewSeal(e.target.value)}
          onPressEnter={() => newSeal.trim() && createSealM.mutate(newSeal.trim())}
        />
      </Modal>
      <style>{`@media print { button { display: none } }`}</style>
    </div>
  )
}
