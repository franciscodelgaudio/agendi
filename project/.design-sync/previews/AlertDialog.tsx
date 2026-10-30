import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
  AlertDialogTrigger,
  Button,
} from "agendi"
import { CalendarXIcon, LockIcon, Trash2Icon } from "lucide-react"

export const DeleteConfirmation = () => (
  <AlertDialog defaultOpen>
    <AlertDialogTrigger render={<Button variant="destructive" />}>
      <Trash2Icon data-icon="inline-start" />
      Excluir serviço
    </AlertDialogTrigger>
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>Excluir serviço?</AlertDialogTitle>
        <AlertDialogDescription>
          O serviço <strong>Massagem Candle</strong> será excluído permanentemente. Essa ação não pode ser desfeita.
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel>Cancelar</AlertDialogCancel>
        <AlertDialogAction variant="destructive">Excluir</AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
)

export const WithMedia = () => (
  <AlertDialog defaultOpen>
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogMedia>
          <CalendarXIcon />
        </AlertDialogMedia>
        <AlertDialogTitle>Cancelar agendamento?</AlertDialogTitle>
        <AlertDialogDescription>
          O horário de <strong>Mariana Souza</strong> em 30/10 às 14:00 será liberado e a cliente recebe um aviso por
          email.
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel>Voltar</AlertDialogCancel>
        <AlertDialogAction variant="destructive">Cancelar agendamento</AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
)

export const SmallSize = () => (
  <AlertDialog defaultOpen>
    <AlertDialogContent size="sm">
      <AlertDialogHeader>
        <AlertDialogMedia>
          <LockIcon />
        </AlertDialogMedia>
        <AlertDialogTitle>Fechar o caixa?</AlertDialogTitle>
        <AlertDialogDescription>
          Depois de fechado, os lançamentos de hoje não podem mais ser editados.
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel>Agora não</AlertDialogCancel>
        <AlertDialogAction>Fechar caixa</AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
)
