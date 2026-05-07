import { useEffect, useState, useMemo } from 'react'
import { Plus, Edit2, Trash2, X, AlertCircle, Search } from 'lucide-react'
import { useProfile } from '../hooks/useProfile'
import { supabase } from '../lib/supabase'
import { useDepartments } from '../hooks/useDepartments'

export interface User {
  id: string
  name: string
  email: string
  role: 'admin' | 'agent' | 'manager'
  department_id?: string
  departmentName?: string
  status: 'active' | 'inactive'
}

export default function Users() {
  const { profile } = useProfile()
  const { departments } = useDepartments(profile?.tenant_id || null)
  const [users, setUsers] = useState<User[]>([])

  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    role: 'agent' as 'admin' | 'agent' | 'manager',
    department_id: '',
    status: 'active' as 'active' | 'inactive'
  })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const fetchUsers = async () => {
    if (!profile?.tenant_id) return

    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('tenant_id', profile.tenant_id)

    const mapped = ((data || []) as Array<Record<string, unknown>>).map(row => {
      const departmentId = String(row.department_id || '')
      const departmentName = departments.find(dep => dep.id === departmentId)?.name
      return {
        id: String(row.id),
        name: String(row.name || '-'),
        email: String(row.email || '-'),
        role: (String(row.role || 'agent') as 'admin' | 'agent' | 'manager'),
        department_id: departmentId || undefined,
        departmentName,
        status: (String(row.status || 'active') as 'active' | 'inactive'),
      }
    })

    setUsers(mapped)
  }

  useEffect(() => {
    if (!profile?.tenant_id) return

    fetchUsers()
  }, [departments, profile?.tenant_id])

  const filteredUsers = useMemo(() => {
    return users.filter(u =>
      u.name.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase())
    )
  }, [users, search])

  const resetForm = () => {
    setFormData({
      name: '',
      email: '',
      role: 'agent',
      department_id: '',
      status: 'active'
    })
    setEditingId(null)
    setError('')
  }

  const handleSave = async () => {
    if (!formData.name.trim() || !formData.email.trim()) {
      setError('Nome e email são obrigatórios')
      return
    }

    setLoading(true)
    setError('')

    try {
      if (editingId) {
        const deptName = departments.find(d => d.id === formData.department_id)?.name
        const { error: updateError } = await supabase
          .from('profiles')
          .update({
            name: formData.name,
            email: formData.email,
            role: formData.role,
            department_id: formData.department_id || null,
            status: formData.status,
          })
          .eq('id', editingId)

        if (updateError) throw updateError

        setUsers(users.map(u =>
          u.id === editingId
            ? { ...u, ...formData, departmentName: deptName }
            : u
        ))
      } else {
        const { data: invokeData, error: invokeError } = await supabase.functions.invoke('invite-collaborator', {
          body: {
            name: formData.name,
            email: formData.email,
            role: formData.role,
            department_id: formData.department_id || null,
            status: formData.status,
          },
        })

        if (invokeError) throw invokeError
        if (invokeData?.error) throw new Error(String(invokeData.error))

        await fetchUsers()
      }
      resetForm()
      setShowForm(false)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao salvar usuario'
      setError(message)
    } finally {
      setLoading(false)
    }
  }

  const handleEdit = (user: User) => {
    setFormData({
      name: user.name,
      email: user.email,
      role: user.role,
      department_id: user.department_id || '',
      status: user.status
    })
    setEditingId(user.id)
    setShowForm(true)
  }

  const handleDelete = (id: string) => {
    if (confirm('Tem certeza que deseja deletar este usuário?')) {
      supabase
        .from('profiles')
        .update({ status: 'inactive' })
        .eq('id', id)
        .then(({ error: updateError }) => {
          if (updateError) {
            alert(updateError.message)
            return
          }
          setUsers(users.map(user => user.id === id ? { ...user, status: 'inactive' } : user))
        })
    }
  }

  const roleMap: Record<string, { label: string; color: string }> = {
    admin: { label: 'Administrador', color: 'bg-purple-100 text-purple-700' },
    manager: { label: 'Gerente', color: 'bg-blue-100 text-blue-700' },
    agent: { label: 'Agente', color: 'bg-green-100 text-green-700' },
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Gestão de Colaboradores</h2>
          <p className="text-gray-500 text-sm">Gerencie perfis existentes e permissões da equipe</p>
        </div>
        <button
          onClick={() => {
            resetForm()
            setShowForm(true)
          }}
          className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
        >
          <Plus size={16} />
          Novo Colaborador
        </button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search size={16} className="absolute left-3 top-3 text-gray-400" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por nome ou email..."
          className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
        />
      </div>

      {/* Modal/Form */}
      {showForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-lg max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-gray-900">
                {editingId ? 'Editar Colaborador' : 'Novo Colaborador'}
              </h3>
              <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
            </div>

            {error && (
              <div className="mb-4 p-3 bg-red-50 text-red-700 text-sm rounded-lg flex items-center gap-2">
                <AlertCircle size={16} />
                {error}
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Nome *</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="Ex: João Silva"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Email *</label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="Ex: joao@company.com"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Função</label>
                <select
                  value={formData.role}
                  onChange={(e) => setFormData({ ...formData, role: e.target.value as any })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="agent">Agente</option>
                  <option value="manager">Gerente</option>
                  <option value="admin">Administrador</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Setor</label>
                <select
                  value={formData.department_id}
                  onChange={(e) => setFormData({ ...formData, department_id: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="">Sem setor</option>
                  {departments.map(d => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Status</label>
                <div className="space-y-2">
                  {(['active', 'inactive'] as const).map(s => (
                    <label key={s} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        value={s}
                        checked={formData.status === s}
                        onChange={(e) => setFormData({ ...formData, status: e.target.value as any })}
                        className="w-4 h-4"
                      />
                      <span className="text-sm text-gray-700">
                        {s === 'active' ? 'Ativo' : 'Inativo'}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowForm(false)}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium"
              >
                Cancelar
              </button>
              <button
                onClick={handleSave}
                disabled={loading}
                className="flex-1 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors font-medium disabled:opacity-50"
              >
                {loading ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* List */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        {filteredUsers.length === 0 ? (
          <div className="p-12 text-center">
            <div className="text-gray-400 mb-2">👥</div>
            <p className="text-gray-500">
              {search ? 'Nenhum colaborador encontrado' : 'Nenhum colaborador criado ainda'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  {['Nome', 'Email', 'Função', 'Setor', 'Status', 'Ações'].map(h => (
                    <th key={h} className="text-left text-xs font-medium text-gray-600 px-5 py-3">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredUsers.map(user => {
                  const r = roleMap[user.role]
                  return (
                    <tr key={user.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-5 py-3.5 font-medium text-gray-900 text-sm">{user.name}</td>
                      <td className="px-5 py-3.5 text-sm text-gray-600">{user.email}</td>
                      <td className="px-5 py-3.5">
                        <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-medium ${r.color}`}>
                          {r.label}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-sm text-gray-600">{user.departmentName || '-'}</td>
                      <td className="px-5 py-3.5 text-sm">
                        <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-medium ${user.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'}`}>
                          {user.status === 'active' ? 'Ativo' : 'Inativo'}
                        </span>
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleEdit(user)}
                            className="p-1.5 hover:bg-blue-100 text-blue-600 rounded transition-colors"
                            title="Editar"
                          >
                            <Edit2 size={14} />
                          </button>
                          <button
                            onClick={() => handleDelete(user.id)}
                            className="p-1.5 hover:bg-red-100 text-red-600 rounded transition-colors"
                            title="Deletar"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
