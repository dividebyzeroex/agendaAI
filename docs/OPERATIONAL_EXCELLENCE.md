# Rotina completa para barbearias pequenas

## Confiabilidade

O formulário de agenda usa `create_agenda_series`, inclusive para uma visita. Uma chave estável por tentativa impede duplicação após falha de rede. Até 12 reservas semanais, quinzenais ou a cada quatro semanas são criadas na mesma transação; conflito em qualquer uma desfaz a série inteira. A restrição de sobreposição existente continua no banco. Os dados do formulário permanecem em falhas. Respostas antigas de carregamento são descartadas ao trocar de estabelecimento.

O Caixa usa `checkout_atomic`: atendimento, comanda paga com timestamp, estoque, movimentação, desconto de fidelidade e comissão são gravados juntos. Preços e regras são consultados no banco. Comissão percentual incide sobre o serviço depois do desconto; produtos não entram nessa base. Quantias são registros informados pelo estabelecimento, não prova de liquidação bancária. O preço próprio do profissional é respeitado. Repetir a chave ou o mesmo atendimento devolve a comanda existente. Venda avulsa exige cliente e produtos. Estoque insuficiente desfaz toda a operação.

A abertura é serializada por estabelecimento. O fechamento trava a sessão e calcula o dinheiro no banco; considera fundo inicial sem duplicar movimentos legados de abertura. Novos movimentos não entram em caixa fechado. Estorno de venda é transacional e idempotente, registra saída, cancela a comanda e comissões pendentes. Comissão já paga exige revisão antes do estorno. Não executa reembolso bancário nem repõe estoque automaticamente.

## Primeiro valor e retorno

Ativação tem seis marcos: serviço, profissional, disponibilidade, agendamento, atendimento concluído e recebimento registrado. Conta apenas eventos reais, excluindo metadata demo/test. Solicitar ajuda registra uma dúvida no suporte com o próximo passo. O Owner vê atendimentos concluídos, recebidos e data da primeira rotina completa por estabelecimento, separados da receita da assinatura AgendaAI.

Ao concluir um atendimento, “Agendar próxima visita” reaproveita cliente, serviço e profissional e sugere uma data futura. O cliente pode ajustar tudo antes de salvar. Repetições não contratam planos nem fazem cobranças recorrentes.

## Financeiro conferível

Resumo por São Paulo: recebimentos registrados hoje, atendimentos concluídos ainda a receber (incluindo dias anteriores), retiradas e comissões por profissional. Recebimentos antigos sem pago_em não são tratados como recebimento de hoje. Retirada não é automaticamente despesa; não se mostra lucro sem classificação completa. A gaveta considera somente dinheiro; Pix e cartão não viram dinheiro físico.

## Notificações operacionais

Fila `appointment_messages` é alimentada por novas reservas, alterações e cancelamentos quando o estabelecimento ativa SMS. Lembretes são programados 24h antes. Rotina Vercel diária às 08h de São Paulo, lotes de até dez; não é envio instantâneo e pode haver atraso de um ciclo. Histórico e ativação ficam em Primeiros passos. Preferência individual de não receber fica no cadastro do cliente.

Sem configuração Twilio e `APPOINTMENT_SMS_VERIFIED=true`, nenhum envio automático é liberado. A homologação com o provedor real não é substituída por testes simulados. Segredos ficam no servidor; contatos legados criptografados são lidos somente pela função exclusiva do worker, nunca persistidos descriptografados na fila. Limites de plano, acesso, preferência e estado do evento são rechecados antes de enviar. Alterações tornam mensagens antigas não enviáveis. Somente uma notificação por evento em uma rodada. Erros ou timeouts ficam para revisão sem retry cego; aceito pelo provedor não significa entregue.

Para homologar: usar conta e destinatário de teste autorizados, conferir SID real e conteúdo/horário, validar quotas, recusa e cancelamento, e só então marcar a variável de verificação. Não anunciar WhatsApp ou envio instantâneo, que não fazem parte desta implementação. Rotinas comerciais e foco em pequenas barbearias são preservados.
