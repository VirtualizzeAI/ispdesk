import { useState } from 'react'
import { Plus, Edit2, Trash2, X, Check, AlertCircle } from 'lucide-react'
import { useProfile } from '../hooks/useProfile'
import { useDepartments } from '../hooks/useDepartments'

const colorOptions = [
  { name: 'Azul', value: 'bg-blue-100 text-blue-700 border-blue-300' },
  { name: 'Vermelho', value: 'bg-red-100 text-red-700 border-red-300' },
  { name: 'Verde', value: 'bg-green-100 text-green-700 border-green-300' },
  { name: 'Roxo', value: 'bg-purple-100 text-purple-700 border-purple-300' },
  { name: 'Laranja', value: 'bg-orange-100 text-orange-700 border-orange-300' },
  { name: 'Rosa', value: 'bg-pink-100 text-pink-700 border-pink-300' },
]

export default function Departments() {
  const { profile } = useProfile()
  const {
    departments,
    loading: loadingDepartments,
    error: departmentsError,
    createDepartment,
    updateDepartment,
    removeDepartment,
  } = useDepartments(profile?.tenant_id || null)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formData, setFormData] = useState({ name: '', description: '', color: colorOptions[0].value })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const resetForm = () => {
    setFormData({ name: '', description: '', color: colorOptions[0].value })
    setEditingId(null)
    setError('')
  }

  const handleSave = async () => {
    if (!formData.name.trim()) {
      setError('Nome do setor é obrigatório')
      return
    }

    setLoading(true)
    setError('')

    try {
      if (editingId) {
        await updateDepartment(editingId, formData)
      } else {
        await createDepartment(formData)
      }
      resetForm()
      setShowForm(false)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao salvar setor'
      setError(message)
    } finally {
      setLoading(false)
    }
  }

  const handleEdit = (dept: { id: string; name: string; description?: string | null; color?: string | null }) => {
    setFormData({
      name: dept.name,
      description: dept.description || '',
      color: dept.color || colorOptions[0].value
    })
    setEditingId(dept.id)
    setShowForm(true)
  }

  const handleDelete = (id: string) => {
    if (confirm('Tem certeza que deseja deletar este setor?')) {
      removeDepartment(id).catch((err: unknown) => {
        const message = err instanceof Error ? err.message : 'Erro ao deletar setor'
        alert(message)
      })
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Gestão de Setores</h2>
          <p className="text-gray-500 text-sm">Organize seus times por departamento</p>
        </div>
        <button
          onClick={() => {
            resetForm()
            setShowForm(true)
          }}
          className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
        >
          <Plus size={16} />
          Novo Setor
        </button>
      </div>

      {/* Modal/Form */}
      {showForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-lg max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-gray-900">
                {editingId ? 'Editar Setor' : 'Novo Setor'}
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
                <label className="block text-sm font-medium text-gray-700 mb-2">Nome do Setor *</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="Ex: Suporte Técnico"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Descrição</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="Descreva o setor..."
                  rows={3}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Cor</label>
                <div className="grid grid-cols-3 gap-2">
                  {colorOptions.map(color => (
                    <button
                      key={color.value}
                      onClick={() => setFormData({ ...formData, color: color.value })}
                      className={`p-3 rounded-lg border-2 transition-all ${formData.color === color.value ? 'border-gray-900 ring-2 ring-indigo-500' : `${color.value} border-transparent opacity-60 hover:opacity-100`}`}
                      title={color.name}
                    >
                      {formData.color === color.value && <Check size={16} />}
                    </button>
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
        {departmentsError && (
          <div className="px-4 py-3 text-sm text-amber-700 bg-amber-50 border-b border-amber-100">
            Nao foi possivel carregar setores do banco: {departmentsError}
          </div>
        )}
        {loadingDepartments && (
          <div className="px-4 py-3 text-sm text-gray-500 border-b border-gray-100">
            Carregando setores...
          </div>
        )}
        {departments.length === 0 ? (
          <div className="p-12 text-center">
            <div className="text-gray-400 mb-2">📁</div>
            <p className="text-gray-500">Nenhum setor criado ainda</p>
            <p className="text-sm text-gray-400 mt-1">Crie seu primeiro setor para começar</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {departments.map(dept => (
              <div key={dept.id} className="p-4 hover:bg-gray-50 transition-colors flex items-center justify-between">
                <div className="flex items-center gap-4 flex-1">
                  <div className={`w-12 h-12 ${dept.color || colorOptions[0].value} rounded-lg flex items-center justify-center font-bold`}>
                    {dept.name.charAt(0)}
                  </div>
                  <div className="flex-1">
                    <h3 className="font-medium text-gray-900">{dept.name}</h3>
                    <p className="text-sm text-gray-500">{dept.description || 'Sem descrição'}</p>
                    <p className="text-xs text-gray-400 mt-1">Setor ativo</p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleEdit(dept)}
                    className="p-2 hover:bg-blue-100 text-blue-600 rounded-lg transition-colors"
                    title="Editar"
                  >
                    <Edit2 size={16} />
                  </button>
                  <button
                    onClick={() => handleDelete(dept.id)}
                    className="p-2 hover:bg-red-100 text-red-600 rounded-lg transition-colors"
                    title="Deletar"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
