# AgendaAI Pay Express — segundo visor do cliente

## Objetivo
O PDV continua sendo o único lugar onde o atendente altera serviços, produtos, preços, descontos, sinal e forma de pagamento. O Display do cliente é uma página pública, pareada e somente leitura, destinada a um monitor, tablet ou segunda aba.

O visor não é uma maquininha. O consumidor usa o próprio telefone para abrir o QR Code do checkout seguro da Stripe. Dados de cartão e credenciais nunca são capturados pelo monitor.

## Como usar
1. Abra Caixa, com uma sessão ativa.
2. Clique em Display do cliente → Abrir segunda tela. Mova a janela para o monitor que fica voltado ao cliente e ative tela cheia, se desejar.
3. Para parear um tablet diferente, leia nele o QR de pareamento mostrado no painel privado do caixa. Ele conecta SOMENTE o segundo dispositivo; não é uma comanda do consumidor e não precisa ser lido a cada venda. Nunca publique esse link.
4. Em repouso, o visor mostra nome, logo e a identidade AgendaAI.
5. Selecione um atendimento concluído na fila de recebimentos ou clique Nova venda e escolha o cliente. O visor sincroniza automaticamente a comanda em andamento, sem QR ou código do cliente. Depois, serviços, produtos, quantidades, descontos e saldo aparecem progressivamente conforme são lançados no caixa.
6. Escolha AgendaAI Pay Express e gere a cobrança. O monitor mostrará o QR para o celular do cliente abrir o checkout Stripe.
7. Quando o backend confirmar o pagamento com a Stripe, o visor mostra Pagamento aprovado por alguns segundos e retorna à tela de descanso.
8. Para pagamentos por Pix externo, dinheiro ou maquininha já recebidos e confirmados pelo atendente, o visor mostra apenas Registrado pela recepção, sem sugerir quitação pela Stripe.
9. Opcionalmente, em Comanda física, associe um identificador impresso ao lançamento para rastreio. O campo Comanda física ou recuperação aceita um código impresso previamente associado à cobrança, ID de atendimento concluído ou link/QR de uma cobrança Stripe pendente do estabelecimento; leitores USB/Bluetooth funcionam como teclado. Um código físico não vinculado a nenhuma venda não pode recuperar itens automaticamente.
10. A comanda digital/recibo é gerada quando o caixa registra a venda ou cria a cobrança; não é requisito prévio para ativar o visor. Ao fechar o caixa, trocar estabelecimento ou encerrar o pareamento, o visor é desconectado.

## Segurança e arquitetura
- Token gerado com dois UUIDs v4 aleatórios; somente no fragmento da URL (#pair), não transmitido na requisição HTTP.
- Sala Realtime identificada por SHA-256 derivado do token. Informações da compra, total e link de pagamento são cifrados por AES-256-GCM com IV aleatório antes de transitar pelo Realtime ou BroadcastChannel.
- Quem tem o link é considerado dispositivo pareado. Proteja o QR de pareamento e encerre a sessão ao fechar o caixa.
- O visor não recebe nome, e-mail, telefone ou credenciais pessoais do cliente; somente nomes de serviços e produtos, quantidades, preços e marca do negócio.
- Somente o caixa modifica os itens. O visor é uma projeção da compra, não um editor financeiro.
- O estado de pagamento não é derivado da comunicação visual do caixa. A cada aproximadamente 6 segundos durante uma cobrança pendente, o visor consulta o endpoint já existente connect-receipt e aceita o sucesso apenas com confirmação online true/status paid verificada pelo backend Stripe.
- Pode haver alguns segundos entre o webhook, a confirmação do servidor e o visor. Sem rede não há confirmação de pagamento fictícia.
- Sem novas tabelas Supabase, sem novas funções Vercel e sem mudança de tarifas ou lógica de liquidação Stripe.

## Testes de aceitação (sandbox)
- [ ] Abrir visor em segunda janela e arrastar para monitor externo.
- [ ] Parear em tablet em outra rede usando QR do painel privado.
- [ ] Verificar nome do negócio em descanso, sem dados da compra anterior.
- [ ] Iniciar venda de balcão; acrescentar e remover produtos, alterar quantidades, conferir soma e descontos em tempo real.
- [ ] Confirmar que o display fica em repouso antes de selecionar o cliente; ao escolher o cliente, aparece automaticamente a comanda sem escanear nada.
- [ ] Conferir que o QR de pareamento do monitor e o QR de pagamento são distintos; o primeiro é usado uma única vez por sessão do visor.
- [ ] Associar um código de comanda física à cobrança e recuperar a cobrança pendente por esse identificador, com isolamento por estabelecimento.
- [ ] Selecionar atendimento com preço próprio e sinal recebido; verificar total.
- [ ] Criar cobrança teste Stripe, pagar com dados de sandbox e confirmar sucesso apenas após webhook/reconciliação.
- [ ] Simular cancelamento, expiração, cartão recusado e perda de conexão; não mostrar aprovação.
- [ ] Registrar pagamento por maquininha/Pix externo e confirmar apenas registro no caixa.
- [ ] Ler código de comanda pendente com scanner; rejeitar comanda de outro tenant e já paga.
- [ ] Encerrar pareamento, fechar caixa, trocar tenant e testar tablet 16:9/mobile.

## Limitações deliberadas
- Não é possível editar itens de uma cobrança Stripe já emitida sem cancelar e recriar uma cobrança segura.
- O QR abre o checkout no telefone do cliente, não captura cartão no monitor compartilhado.
- Um link de pareamento é uma credencial temporária: cuidado ao compartilhá-lo.