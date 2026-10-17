# Hotmart → AgendaAI (branch develop)

## Oferta vinculada
- E-book Método Barbearia Lucrativa + licença anual AgendaAI, pagamento único **R$ 899** no checkout Hotmart.
- A licença inicia na **data da compra aprovada** e termina após 12 meses; não há cobrança recorrente pelo AgendaAI nesta integração.
- O SKU/produto é validado por `HOTMART_PRODUCT_ID`. **O servidor não confia no preço enviado no webhook**: preço e oferta devem ser configurados corretamente no checkout Hotmart.

## Antes de habilitar vendas
1. Aplicar a migration `supabase/migrations/20261012220000_hotmart_licenses.sql` ao projeto Supabase associado ao ambiente develop. Ela usa RLS e só a service role pode ler/gravar licenças.
2. Configurar em Vercel (somente ambiente correto): `HOTMART_HOTTOK`, `HOTMART_PRODUCT_ID`, `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY`. Nunca colocar os segredos no frontend.
3. Criar o produto de R$ 899 na Hotmart; configurar webhook versão 2.0.0 para `https://<host>/api/hotmart-webhook`. Eventos: PURCHASE_APPROVED, PURCHASE_REFUNDED, PURCHASE_CHARGEBACK e PURCHASE_CANCELED.
4. Verificar entrega de teste com compra aprovada, aprovação duplicada, compra pendente (ignorada), produto alheio (ignorado), token inválido (401), estorno e tentativa de nova aprovação após estorno (ignorada).
5. Confirmar que clientes existentes Stripe mantêm sua assinatura e que um comprador Hotmart com e-mail **verificado** consegue entrar, criar uma barbearia e ativar sua licença automaticamente.

## Jornada
- Compra aprovada → webhook confere hottok e ID do produto → grava um registro por transação.
- Comprador cria conta com o **mesmo e-mail da Hotmart** e confirma esse e-mail.
- Ao finalizar o onboarding, `/api/hotmart-activate` encontra sua compra, valida proprietário do estabelecimento e concede `plano_expires_at`.
- Usuário preexistente sem acesso válido é direcionado ao mesmo resgate pelo billing guard.
- Compra devolvida / chargeback → transação é marcada revogada e a expiração é ajustada somente quando corresponde à licença Hotmart e não há vínculo de assinatura Stripe.

## Limitações para lançamento
- A integração **não** cria contas automaticamente nem envia e-mail de convite; o comprador precisa se cadastrar e confirmar o e-mail.
- A implementação não aplica os limites anunciados de 5 profissionais e 1.000 agendamentos/mês. Esses controles exigem verificações adicionais nos endpoints que criam profissionais/agendamentos. Não publicar uma promessa de limites técnicos sem implementá-los.
- O fluxo de reversão de pagamentos deve ser testado em banco de homologação, especialmente para clientes com acesso anterior de outra origem.
- O valor de R$ 899 está na oferta Hotmart, não no código do webhook.
- As migrações precisam ser aplicadas e os segredos configurados; um commit em develop por si só não ativa o fluxo em produção.
