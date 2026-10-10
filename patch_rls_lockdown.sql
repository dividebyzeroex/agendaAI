-- ==========================================
-- SCRIPT DE LOCKDOWN E CORREÇÃO DE VAZAMENTO DE DADOS (RLS)
-- Remove políticas permissivas que permitiam "Cross-Tenant Data Leak".
-- ==========================================

-- 1. DROP NAS POLÍTICAS PERMISSIVAS DA TABELA: clientes
DROP POLICY IF EXISTS "Autenticado gerencia clientes" ON public.clientes;
DROP POLICY IF EXISTS "admin_all_clientes" ON public.clientes;
DROP POLICY IF EXISTS "Estabelecimento acessa seus clientes" ON public.clientes;
DROP POLICY IF EXISTS "pub_select_clientes" ON public.clientes;
DROP POLICY IF EXISTS "pub_insert_clientes" ON public.clientes;

-- 2. DROP NAS POLÍTICAS PERMISSIVAS DA TABELA: agenda_events
DROP POLICY IF EXISTS "Autenticado atualiza agenda" ON public.agenda_events;
DROP POLICY IF EXISTS "Autenticado deleta agenda" ON public.agenda_events;
DROP POLICY IF EXISTS "admin_update_agenda" ON public.agenda_events;
DROP POLICY IF EXISTS "admin_delete_agenda" ON public.agenda_events;
DROP POLICY IF EXISTS "Painel acessa sua agenda" ON public.agenda_events;
DROP POLICY IF EXISTS "Qualquer um pode criar agendamento" ON public.agenda_events;
DROP POLICY IF EXISTS "pub_select_agenda" ON public.agenda_events;
DROP POLICY IF EXISTS "pub_insert_agenda" ON public.agenda_events;
DROP POLICY IF EXISTS "Clientes podem criar agenda"  ON public.agenda_events;
DROP POLICY IF EXISTS "Agenda pública read"          ON public.agenda_events;
DROP POLICY IF EXISTS "Admin agenda update/delete"   ON public.agenda_events;
DROP POLICY IF EXISTS "Admin agenda delete"          ON public.agenda_events;

-- 3. DROP NAS POLÍTICAS PERMISSIVAS DA TABELA: estabelecimento
DROP POLICY IF EXISTS "admin_all_estabelecimento" ON public.estabelecimento;
DROP POLICY IF EXISTS "Owner lê seu estabelecimento" ON public.estabelecimento;
DROP POLICY IF EXISTS "Owner edita seu estabelecimento" ON public.estabelecimento;
DROP POLICY IF EXISTS "Owner cria seu estabelecimento" ON public.estabelecimento;
DROP POLICY IF EXISTS "pub_select_estabelecimento" ON public.estabelecimento;
DROP POLICY IF EXISTS "Estabelecimento público" ON public.estabelecimento;

-- 4. DROP NAS POLÍTICAS PERMISSIVAS DA TABELA: servicos
DROP POLICY IF EXISTS "Autenticado gerencia servicos UPDATE" ON public.servicos;
DROP POLICY IF EXISTS "Autenticado gerencia servicos DELETE" ON public.servicos;
DROP POLICY IF EXISTS "Autenticado gerencia servicos INSERT" ON public.servicos;
DROP POLICY IF EXISTS "admin_all_servicos" ON public.servicos;
DROP POLICY IF EXISTS "Painel acessa seus serviços" ON public.servicos;
DROP POLICY IF EXISTS "pub_select_servicos" ON public.servicos;
DROP POLICY IF EXISTS "Serviços públicos" ON public.servicos;

-- 5. DROP NAS POLÍTICAS PERMISSIVAS DA TABELA: produtos
DROP POLICY IF EXISTS "admin_all_produtos" ON public.produtos;
DROP POLICY IF EXISTS "pub_select_produtos" ON public.produtos;

-- 6. DROP NAS POLÍTICAS PERMISSIVAS DA TABELA: profissionais
DROP POLICY IF EXISTS "admin_all_profissionais" ON public.profissionais;
DROP POLICY IF EXISTS "Painel acessa seus profissionais" ON public.profissionais;
DROP POLICY IF EXISTS "pub_select_profissionais" ON public.profissionais;

-- 7. DROP NAS POLÍTICAS PERMISSIVAS: profissional_disponibilidades & servicos
DROP POLICY IF EXISTS "admin_all_prof_disp" ON public.profissional_disponibilidades;
DROP POLICY IF EXISTS "pub_select_prof_disp" ON public.profissional_disponibilidades;
DROP POLICY IF EXISTS "admin_all_prof_servicos" ON public.profissional_servicos;
DROP POLICY IF EXISTS "pub_select_prof_servicos" ON public.profissional_servicos;

-- 8. DROP NAS POLÍTICAS PERMISSIVAS DA TABELA: comissoes
DROP POLICY IF EXISTS "Admin pode ver todas as comissões" ON public.comissoes;

-- 9. DROP NAS POLÍTICAS PERMISSIVAS DA TABELA: horarios_funcionamento
DROP POLICY IF EXISTS "Autenticado gerencia horarios INSERT" ON public.horarios_funcionamento;
DROP POLICY IF EXISTS "Autenticado gerencia horarios UPDATE" ON public.horarios_funcionamento;
DROP POLICY IF EXISTS "Autenticado gerencia horarios DELETE" ON public.horarios_funcionamento;
DROP POLICY IF EXISTS "admin_all_horarios" ON public.horarios_funcionamento;
DROP POLICY IF EXISTS "Painel acessa seus horarios" ON public.horarios_funcionamento;
DROP POLICY IF EXISTS "pub_select_horarios" ON public.horarios_funcionamento;
DROP POLICY IF EXISTS "Horários públicos" ON public.horarios_funcionamento;

-- 10. DROP NAS POLÍTICAS PERMISSIVAS DA TABELA: workflows
DROP POLICY IF EXISTS "Autenticado gerencia workflows" ON public.workflows;
DROP POLICY IF EXISTS "Admin workflows" ON public.workflows;

-- 11. DROP NAS POLÍTICAS PERMISSIVAS DA TABELA: caixa_produtos
DROP POLICY IF EXISTS "admin_all_caixa_produtos" ON public.caixa_produtos;
DROP POLICY IF EXISTS "pub_insert_caixa_produtos" ON public.caixa_produtos;
DROP POLICY IF EXISTS "pub_select_caixa_produtos" ON public.caixa_produtos;

-- 12. DROP NAS POLÍTICAS PERMISSIVAS DA TABELA: caixa_itens
DROP POLICY IF EXISTS "pub_insert_caixa" ON public.caixa_itens;
DROP POLICY IF EXISTS "pub_select_caixa" ON public.caixa_itens;
DROP POLICY IF EXISTS "admin_update_caixa" ON public.caixa_itens;


-- ================================================================
-- RECRIAÇÃO DAS POLÍTICAS SEGURAS BASEADAS ESTRITAMENTE NO TENANT
-- ================================================================

-- As tabelas estabelecimento, agenda_events, clientes e profissionais já possuem 
-- as políticas "Acesso <X> RBAC". Vamos apenas recriá-las com IF NOT EXISTS para garantir.

-- ESTABELECIMENTO
DROP POLICY IF EXISTS "Acesso Estabelecimento RBAC" ON public.estabelecimento;
CREATE POLICY "Acesso Estabelecimento RBAC" ON public.estabelecimento 
FOR ALL USING (id IN (SELECT * FROM public.get_meus_estabelecimentos()));

-- Criação do estabelecimento (necessário quando o usuário acaba de se cadastrar e não tem nenhum)
DROP POLICY IF EXISTS "Dono cria seu estabelecimento" ON public.estabelecimento;
CREATE POLICY "Dono cria seu estabelecimento" ON public.estabelecimento 
FOR INSERT WITH CHECK (user_id = auth.uid());


-- AGENDA EVENTS
DROP POLICY IF EXISTS "Acesso Agenda RBAC" ON public.agenda_events;
CREATE POLICY "Acesso Agenda RBAC" ON public.agenda_events 
FOR ALL USING (estabelecimento_id IN (SELECT * FROM public.get_meus_estabelecimentos()));


-- CLIENTES
DROP POLICY IF EXISTS "Acesso Clientes RBAC" ON public.clientes;
CREATE POLICY "Acesso Clientes RBAC" ON public.clientes 
FOR ALL USING (estabelecimento_id IN (SELECT * FROM public.get_meus_estabelecimentos()));


-- PROFISSIONAIS
DROP POLICY IF EXISTS "Acesso Profissionais RBAC" ON public.profissionais;
CREATE POLICY "Acesso Profissionais RBAC" ON public.profissionais 
FOR ALL USING (estabelecimento_id IN (SELECT * FROM public.get_meus_estabelecimentos()));


-- SERVICOS
DROP POLICY IF EXISTS "Acesso Servicos RBAC" ON public.servicos;
CREATE POLICY "Acesso Servicos RBAC" ON public.servicos 
FOR ALL USING (estabelecimento_id IN (SELECT * FROM public.get_meus_estabelecimentos()));


-- PRODUTOS
DROP POLICY IF EXISTS "Acesso Produtos RBAC" ON public.produtos;
CREATE POLICY "Acesso Produtos RBAC" ON public.produtos 
FOR ALL USING (estabelecimento_id IN (SELECT * FROM public.get_meus_estabelecimentos()));


-- COMISSOES (Usa profissional_id para inferir estabelecimento)
DROP POLICY IF EXISTS "Acesso Comissoes RBAC" ON public.comissoes;
CREATE POLICY "Acesso Comissoes RBAC" ON public.comissoes 
FOR ALL USING (profissional_id IN (SELECT id FROM public.profissionais WHERE estabelecimento_id IN (SELECT * FROM public.get_meus_estabelecimentos())));


-- HORARIOS DE FUNCIONAMENTO
DROP POLICY IF EXISTS "Acesso Horarios RBAC" ON public.horarios_funcionamento;
CREATE POLICY "Acesso Horarios RBAC" ON public.horarios_funcionamento 
FOR ALL USING (estabelecimento_id IN (SELECT * FROM public.get_meus_estabelecimentos()));


-- PROFISSIONAL DISPONIBILIDADES
DROP POLICY IF EXISTS "Acesso Prof Disp RBAC" ON public.profissional_disponibilidades;
CREATE POLICY "Acesso Prof Disp RBAC" ON public.profissional_disponibilidades 
FOR ALL USING (profissional_id IN (SELECT id FROM public.profissionais WHERE estabelecimento_id IN (SELECT * FROM public.get_meus_estabelecimentos())));


-- PROFISSIONAL SERVIÇOS
DROP POLICY IF EXISTS "Acesso Prof Servs RBAC" ON public.profissional_servicos;
CREATE POLICY "Acesso Prof Servs RBAC" ON public.profissional_servicos 
FOR ALL USING (profissional_id IN (SELECT id FROM public.profissionais WHERE estabelecimento_id IN (SELECT * FROM public.get_meus_estabelecimentos())));


-- WORKFLOWS (Tabela global, não tem estabelecimento_id)
DROP POLICY IF EXISTS "Autenticado gerencia workflows" ON public.workflows;
CREATE POLICY "Autenticado gerencia workflows" ON public.workflows 
FOR ALL USING (auth.role() = 'authenticated');


-- CAIXA PRODUTOS E ITENS
DROP POLICY IF EXISTS "Acesso Caixa Itens RBAC" ON public.caixa_itens;
CREATE POLICY "Acesso Caixa Itens RBAC" ON public.caixa_itens 
FOR ALL USING (estabelecimento_id IN (SELECT * FROM public.get_meus_estabelecimentos()));

DROP POLICY IF EXISTS "Acesso Caixa Produtos RBAC" ON public.caixa_produtos;
CREATE POLICY "Acesso Caixa Produtos RBAC" ON public.caixa_produtos 
FOR ALL USING (caixa_item_id IN (SELECT id FROM public.caixa_itens WHERE estabelecimento_id IN (SELECT * FROM public.get_meus_estabelecimentos())));
