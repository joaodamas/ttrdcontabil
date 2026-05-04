import type { Meta, StoryObj } from '@storybook/nextjs'
import { FormField, FormMessage } from '../form-field'
import { Input } from '../input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../select'

const meta: Meta = {
  title: 'UI/FormField',
  tags: ['autodocs'],
}
export default meta
type Story = StoryObj

export const Default: Story = {
  render: () => (
    <div className="flex flex-col gap-4 w-80 p-4">
      <FormField label="Razão Social" required htmlFor="razao">
        <Input id="razao" placeholder="Ex: Tech Solutions Ltda" />
      </FormField>
      <FormField label="CPF / CNPJ" required htmlFor="cnpj" hint="Somente números, sem formatação">
        <Input id="cnpj" placeholder="00.000.000/0001-00" />
      </FormField>
    </div>
  ),
}

export const WithValidationErrors: Story = {
  name: 'Com Erros de Validação',
  render: () => (
    <div className="flex flex-col gap-4 w-80 p-4">
      <FormField label="Razão Social" required htmlFor="razao-err" error="Campo obrigatório">
        <Input id="razao-err" aria-invalid="true" placeholder="Ex: Tech Solutions Ltda" />
      </FormField>
      <FormField label="E-mail" required htmlFor="email-err" error="Formato de e-mail inválido">
        <Input id="email-err" aria-invalid="true" type="email" defaultValue="email-invalido" />
      </FormField>
      <FormField label="Regime Tributário" required htmlFor="regime-err" error="Selecione um regime">
        <Select>
          <SelectTrigger id="regime-err" aria-invalid="true" className="w-full">
            <SelectValue placeholder="Selecione..." />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="simples">Simples Nacional</SelectItem>
            <SelectItem value="presumido">Lucro Presumido</SelectItem>
          </SelectContent>
        </Select>
      </FormField>
    </div>
  ),
}

export const FormMessageStandalone: Story = {
  name: 'FormMessage Standalone',
  render: () => (
    <div className="flex flex-col gap-2 p-4">
      <FormMessage>CNPJ já cadastrado no sistema</FormMessage>
      <FormMessage>Data de vencimento não pode ser anterior a hoje</FormMessage>
      <FormMessage>Valor deve ser maior que zero</FormMessage>
    </div>
  ),
}
