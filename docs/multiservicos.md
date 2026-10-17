# AgendaAI — Atendimento Multisserviços

## Cenário 1: corte e manicure em paralelo
1. Agenda → Novo agendamento → selecione o cliente, serviço principal e primeiro profissional.
2. Clique **Adicionar serviço**, escolha manicure, outro profissional e **Ao mesmo tempo que o primeiro**.
3. Confira a previsão de horários e salve. São criadas duas reservas reais na agenda, vinculadas à mesma comanda-mãe.
4. Ao receber, abra o atendimento principal no Caixa. O serviço extra é carregado automaticamente; confirme ambos e gere uma única cobrança.
5. Cada profissional recebe comissão somente sobre seus serviços, com taxa específica quando configurada ou padrão do cadastro.

## Cenário 2: serviços extras pedidos durante o atendimento
1. Abra o atendimento no Caixa.
2. Em **Serviços deste atendimento**, clique **Acrescentar serviço durante o atendimento**.
3. Escolha o serviço, o responsável e execução sequencial ou paralela.
4. O AgendaAI confere e reserva o horário do profissional imediatamente. Se houver conflito, a operação é recusada e a comanda original permanece.
5. O serviço passa a aparecer no total, na segunda tela Pay Express, na comanda digital e na impressão de recibo.
6. Antes de criar a cobrança, o atendente pode retirar um item extra, liberando o horário correspondente.

## Regras
- Até 8 serviços por atendimento.
- O profissional não pode executar tarefas sobrepostas, e o banco mantém a exclusão de horários por profissional.
- Um único pagamento Stripe Connect cobre todos os serviços; as comissões são armazenadas com o ID individual de evento/serviço/profissional, incluindo regras fixas ou percentuais.
- Após emitir uma cobrança, os serviços ficam congelados. Para alterar, cancele ou resolva a cobrança pelo fluxo financeiro; nunca edite um Stripe Checkout já criado.
- As transações Stripe históricas com comissão armazenada como objeto continuam suportadas; os novos atendimentos usam uma lista congelada de comissões.
- Fidelidade é aplicada somente sobre o serviço principal, seguindo a regra preexistente; não reduz o valor das comissões dos serviços extras.
- Agendamentos recorrentes permanecem de serviço único. Multiagendamento exige uma visita por vez.
- Cancelar a reserva principal cancela os horários de todos os serviços associados. Para reagendar um grupo, cancele e reserve novamente; mover isoladamente um único slot é bloqueado para evitar conflitos de horários.
- No caixa, cada profissional aparece na agenda no seu próprio horário. O recebimento agrupado ocorre sempre pelo atendimento principal, inclusive se um serviço-filho for selecionado.
- O pagamento não é considerado realizado ao gerar QR ou link; a Stripe confirma via servidor antes do lançamento de comissões online.

## Migrações e dependências
A funcionalidade é aditiva à entrega de Pay Express e herança de comissões do PR #13:
1. 20261017210900_commission_rate_inheritance.sql
2. 20261017221500_multi_service_schedule.sql
3. 20261017222000_multi_service_checkout.sql
4. 20261017222500_multi_service_reversals.sql
5. 20261017222700_multi_service_group_integrity.sql

**Não aplicar a terceira migração sozinha**. Verifique tests:db, typecheck:api, test:api, build e teste financeiro Stripe sandbox antes de publicar ou aceitar pagamentos reais multisserviço.

## Testes de aceitação
- [ ] Corte + manicure no mesmo horário com diferentes profissionais.
- [ ] Corte + barba + sobrancelha com um profissional em sequência.
- [ ] Bloqueio da mesma pessoa em serviços paralelos.
- [ ] Bloqueio de horários conflitantes com agendamentos anteriores e simultâneos.
- [ ] Inclusão e remoção de serviço extra durante atendimento.
- [ ] Tentativa de inclusão depois de emitir a cobrança deve ser recusada.
- [ ] Comanda única contém todos os itens e o valor total correto.
- [ ] Venda presencial cria comissão separada por serviço.
- [ ] Stripe: QR e valor total, confirmação, liquidação e comissões separadas sem duplicações em retransmissões do webhook.
- [ ] Comandas Stripe antigas, individuais, ainda liquidam corretamente.
- [ ] Estorno manual cancela todas as comissões pendentes do grupo e bloqueia estorno se qualquer comissão já foi paga.
- [ ] Reembolso Stripe total sinaliza estorno para todas as comissões pendentes do grupo; comissões pagas exigem conferência financeira específica.
- [ ] Expiração Stripe libera as flags de todos os agendamentos vinculados, sem duplicar receita.
- [ ] Pay Express mostra os itens/total e só confirma sucesso após resposta confiável da Stripe.
- [ ] A agenda mostra profissional e intervalo correto em celular e desktop.
- [ ] Ao cancelar o agendamento principal, todos os serviços vinculados saem da agenda ativa.
- [ ] Não é permitido arrastar apenas um slot de um grupo para criar agendamento inconsistente.
