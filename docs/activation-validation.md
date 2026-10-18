# Configuração guiada e resumo de uso

Implementação: painel principal /admin/dashboard. Etapas: serviço ativo com duração, profissional ativo, disponibilidade compatível com serviço vinculado e horário do negócio, primeiro agendamento não cancelado/teste. O atalho de serviço abre a aba correta em Configurações. Atualização ao abrir o painel, recuperar foco ou tocar Atualizar.

Resumo durante o piloto: desde a criação do estabelecimento até a consulta. Fora do piloto: últimos 30 dias. Agendamentos e concluídos são registros criados no período, com estado atual; cancelados e metadata demo/test=true são excluídos. Reservas pelo link exigem origin=public_booking. Clientes e registros no caixa são contagens, sem alegação de receita recebida. RPC security invoker mantém RLS e escopo do estabelecimento. Erros de consulta não aparecem como zero uso.

## Validação executada em 11/10/2026
- Build Angular aprovado.
- 23 testes aprovados: consultas com isolamento RLS, intervalo de atendimento, horários incompatíveis, exclusão de demonstrações/cancelamentos, período, navegação dos atalhos, atualização de progresso, recuperação de falha e descarte de resposta do estabelecimento anterior; regressões de reserva, rotas e contratação.
- Consulta autenticada da nova RPC no Supabase aprovada; consulta a outro estabelecimento recusada. Nenhum dado de cliente alterado no teste.
- Cadastro publicado inspecionado: informa teste de 30 dias sem cartão e sem cobrança automática, exige termos e mantém opção de marketing separada.
- Migração aplicada no Supabase. Frontend permanece na develop até publicação.

## Limites da homologação mobile
O navegador local de testes não pôde ser instalado (download retornou arquivo incompleto). O navegador remoto disponível não oferece emulação de viewport nesta sessão. Por isso, não foi homologado visualmente o percurso completo em Safari/iPhone ou Chrome/Android. Os testes de componente não substituem essa validação.

Após publicar, completar em conta de teste identificada: cadastro e confirmação real do próprio e-mail, serviço, profissional e disponibilidade, reserva, atendimento, caixa e checkout. Confirmar preservação de dados após recarga, teclado sem ocultar ações, toque e ausência de rolagem horizontal em 320/375/390px. Não marcar um pagamento como homologado até confirmação de evento assinado e valor real no ledger. Nenhuma cobrança real foi feita nesta alteração.
