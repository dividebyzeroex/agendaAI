# Recebimentos opcionais — Stripe Connect

## Modelo e preço proposto

R$ 1,00 por pagamento confirmado, além das tarifas Stripe, absorvido pelo estabelecimento. Não existe uma tarifa fixa universal de mercado. A tarifa de lançamento é uma proposta comercial específica da AgendaAI, e não uma tarifa imposta pela Stripe. Tarifa e versão de aceite são fixadas no servidor; cada pedido preserva seu preço. Alterações futuras exigem novo aceite.

Cobranças diretas na conta conectada, `application_fee_amount=100`. Accounts v2 com dashboard completo, responsabilidades de processamento e perdas com a Stripe, onboarding hospedado e cadastro brasileiro. Não cria ou movimenta repasses manualmente. Stripe faz repasses automáticos conforme o calendário da conta, que é consultado e exibido. Uma conta alterada para repasse manual recebe indicação para revisão no painel Stripe.

A conta Stripe da plataforma deve estar no Brasil para reter application fees de contas brasileiras. O recebimento do estabelecimento e a assinatura SaaS AgendaAI são domínios separados. Nenhum recebimento de um salão renova a assinatura SaaS.

## Experiência

Preparar minha agenda → Receber pela aplicação. Sem vínculo, todo recebimento é presencial. O proprietário passa pelo cadastro Stripe, aceita as condições e ativa online. Depois escolhe Link de pagamento no caixa. O checkout inicial suporta cartão pelo Checkout hospedado; Pix online não está habilitado nesta etapa. Pix presencial continua como registro manual.

A comanda é criada pendente. Preços vêm do catálogo e da regra do profissional. Produtos são reservados na mesma transação. Nenhum valor entra nos recebidos nem gera comissão antes de pagamento confirmado. Benefícios de fidelidade são resgatados no recebimento presencial nesta primeira versão.

A aplicação prepara uma sessão Stripe e compartilha o link público da comanda. O botão Pagar abre o Checkout Stripe. Webhooks e a consulta da própria comanda reconciliam o estado atual no Stripe, usando conta, sessão, identificador do pedido, moeda, total e taxa. Repetições não criam outro recebimento ou outra comissão. A confirmação continua funcionando se o caixa físico já fechou ou se a assinatura expirou. Pagamentos online ficam no histórico próprio, sem fingir entrada de dinheiro físico na gaveta.

Expiração confirmada pela Stripe cancela a comanda e libera estoque uma vez. O proprietário pode cancelar uma cobrança pendente; o backend expira a sessão primeiro. Falha de rede de resultado incerto preserva a cobrança para revisão, sem criar outra. Se a sessão não pôde ser persistida, a mesma chave Stripe a recupera dentro da janela segura de 23h. Após essa janela, uma cobrança sem sessão exige conferência no Stripe antes de qualquer liberação de estoque.

Reembolso total usa `refund_application_fee=true` e chave idempotente. O estado real é consultado, inclusive em notificações repetidas. Comissões pendentes são canceladas em reembolso total; comissões pagas e retorno físico de estoque exigem revisão. Reembolsos parciais e contestações são gerenciados no painel Stripe; o histórico mostra valores reembolsados e status da contestação. O líquido mostrado é o da transação original, e não o saldo bancário após todos os ajustes.

## Ativação necessária

1. Aplicar a migração `stripe_connect_payments`. Tabelas novas têm RLS; contas e pedidos não podem ser alterados pelo navegador. RPC de liquidação e expiração é exclusiva do backend.
2. Ativar Connect no dashboard Stripe brasileiro e completar a configuração de marca/onboarding.
3. Criar destino de eventos **de contas conectadas**, modo correspondente à chave usada, em `https://<PROJECT_URL>/api/webhook?channel=connect`.
4. Configurar `STRIPE_CONNECT_WEBHOOK_SECRET`. Eventos: `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired`, `charge.refunded`, `charge.dispute.created`, `charge.dispute.updated`, `charge.dispute.closed`. O status cadastral e os repasses são consultados diretamente na API Stripe. O webhook de assinatura existente permanece separado.
5. Homologar em sandbox: onboarding incompleto/completo, pagamento, cartão recusado, 3DS, repetição do webhook, expiração, estoque, caixa fechado, reembolso e isolamento entre estabelecimentos. Validar também os repasses no ambiente e nas condições disponibilizadas pela Stripe.
6. Só então configurar `STRIPE_CONNECT_ENABLED=true` para a liberação pretendida. Cada estabelecimento ainda precisa aceitar as condições e ativar o recebimento. Nenhuma conta real foi criada nem pagamento real foi realizado durante implementação.

Fontes verificadas em 15/10/2026:
- https://stripe.com/br/pricing — cartões nacionais 3,99% + R$ 0,39 na tabela pública.
- https://stripe.com/br/connect/pricing — modelo em que Stripe cobra processamento diretamente; o outro modelo tem custos por conta e repasse.
- https://docs.stripe.com/connect/direct-charges.md?platform=web&ui=stripe-hosted
- https://docs.stripe.com/connect/accounts-v2
- https://docs.stripe.com/connect/payouts-connected-accounts

## Validação

Testes locais de migração cobrem reserva, liquidação exata, isolamento, funções restritas, idempotência, comissão única, confirmação após caixa fechado e liberação única de estoque. Testes da API usam Stripe simulado para confirmar escopo da conta, parâmetros e estados. Eles não substituem a homologação real do Connect e dos webhooks.

## Compatibilidade de configuração

O backend aceita o nome documentado `STRIPE_CONNECT_WEBHOOK_SECRET` e também o nome abreviado já cadastrado na Vercel, `STRIPE_CONNECT_WEBHOOK_SEC`. O nome documentado tem prioridade. Isso preserva o segredo existente, pois a Vercel não permite renomear variáveis Sensitive. `GET /api/billing?action=connect-info` retorna somente disponibilidade, tarifa e versão das condições, sem valores de segredos ou dados bancários.

## Onboarding em plataformas existentes

Quando a Stripe rejeita explicitamente Accounts v2 (`accounts_v2_access_blocked`), a aplicação cria a mesma configuração comercial usando Accounts v1 com controller properties e gera o onboarding hospedado compatível. A responsabilidade por processamento e perdas permanece com a Stripe. Não há fallback de criação para falhas de rede ou resultado incerto. A conta persistida é reutilizada. Ativação ou perfil incompleto da plataforma produz instrução específica, em vez de uma mensagem genérica de pagamento.

## Diagnóstico de permissão

Uma recusa definitiva HTTP 403 em Accounts v2 pode usar o caminho compatível Accounts v1 com a mesma chave. A Stripe verifica separadamente as permissões dessa chamada; se também a negar, a aplicação não cria a conta. Não existe fallback para erro de autenticação nem para resultado incerto de rede.

O proprietário recebe etapa, referência da requisição Stripe, escopos `rak_*` exigidos e apenas os quatro caracteres finais da chave efetivamente usada em `STRIPE_SECRET_KEY`. O registro em `logs_seguranca` contém somente esses campos filtrados, sem mensagem bruta do provedor, e-mail, valor da chave ou link de onboarding. Isso permite distinguir falta de permissões da edição de uma chave diferente no painel.
