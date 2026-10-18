from pathlib import Path
from reportlab.pdfgen import canvas
from reportlab.lib.colors import HexColor
from reportlab.lib.utils import simpleSplit
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
BASE=Path(__file__).resolve().parents[1]
FONT='/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
BOLD='/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
pdfmetrics.registerFont(TTFont('Guide',FONT));pdfmetrics.registerFont(TTFont('GuideBold',BOLD))
W,H=595,842
specs={
'barbearia':('Barbearia','Uma cadeira ocupada começa com uma rotina organizada.',['Corte e barba têm durações e intervalos diferentes. Revise cada serviço antes de abrir os horários.','Reserve tempo para limpeza da estação, atrasos e encaixes. O horário disponível precisa caber na rotina real.','Comece com um barbeiro e um serviço. O piloto deve provar uma melhoria na operação, não apenas uma tela bonita.'],'Corte, barba e retorno','Seu corte está marcado para [dia] às [hora], com [profissional]. Se precisar alterar, fale com a equipe com antecedência.','Olá, [nome]. Já está na hora de cuidar do corte ou da barba? Confira os horários disponíveis: [link]. Se preferir não receber lembretes, avise a equipe.'),
'beleza':('Estúdios de beleza','Serviços diferentes. Uma experiência consistente.',['Defina preço, duração e profissional para cada serviço. Coloração, unhas e escova podem ocupar tempos muito diferentes.','Registre preferências e orientações do atendimento sem coletar informações que não serão usadas.','Faça o piloto com um profissional, acompanhe o primeiro atendimento e só depois amplie para o restante da equipe.'],'Agenda, experiência e retorno','Olá, [nome]. Seu [serviço] está marcado para [dia] às [hora], com [profissional]. Confira as orientações combinadas com a equipe e avise se precisar remarcar.','Olá, [nome]. Que tal reservar seu próximo [serviço]? Os horários estão aqui: [link]. Se preferir não receber novas mensagens, nos avise.'),
'petshop':('Pet shops e banho e tosa','O tutor agenda. O cuidado é de cada pet.',['A duração depende do serviço e do porte. Não ofereça um tempo único para todos os atendimentos.','Confirme nome do pet, tutor, contato e cuidados específicos antes de iniciar o serviço.','Separe entrada, atendimento e retirada na sua rotina. Registre as orientações necessárias e confirme qualquer condição especial com o tutor.'],'Tutor, pet e próximo cuidado','Olá, [tutor]. O atendimento de [pet] está marcado para [dia] às [hora]. Confirme com a equipe as orientações, os cuidados e a previsão de retirada.','Olá, [tutor]. Vamos programar o próximo banho de [pet]? Confira os horários em [link]. Se não quiser receber novas mensagens, é só nos avisar.')}

def make(key,data):
 label,tag,decisions,subtitle,confirm,rebook=data
 out=BASE/'public/guias'/f'{key}.pdf';c=canvas.Canvas(str(out),pagesize=(W,H));c.setTitle(f'AgendaAI | Guia prático - {label}');c.setAuthor('AgendaAI')
 y=0
 def text(s,size=11,color='#6f7d94',bold=False,width=487,leading=None):
  nonlocal y
  c.setFillColor(HexColor(color));c.setFont('GuideBold' if bold else 'Guide',size)
  for line in simpleSplit(s,'GuideBold' if bold else 'Guide',size,width):
   c.drawString(54,y,line);y-=leading or size*1.65
  y-=9
 def block(title,body):
  text(title,12,'#263656',True);text(body,10.5)
 def page(n,title,kicker):
  nonlocal y
  c.setFillColor(HexColor('#f8f9fd'));c.rect(0,0,W,H,fill=1,stroke=0)
  c.setFillColor(HexColor('#243352'));c.rect(0,H-98,W,98,fill=1,stroke=0)
  c.setFont('GuideBold',18);c.setFillColor(HexColor('#ffffff'));c.drawString(54,H-45,'AgendaAI')
  c.setFont('Guide',8);c.setFillColor(HexColor('#b7c2dc'));c.drawRightString(W-54,H-43,label.upper())
  c.setFillColor(HexColor('#dfe5f2'));c.setLineWidth(.6);c.line(54,48,W-54,48)
  c.setFont('Guide',7.5);c.setFillColor(HexColor('#8795ae'));c.drawString(54,31,'GUIA GRATUITO DE OPERAÇÃO  /  OUTUBRO 2026');c.drawRightString(W-54,31,f'{n:02d} / 04')
  y=H-135;text(kicker,8,'#8392bc',True);text(title,25,'#263656',True,leading=33)
 page(1,'Uma rotina melhor, antes de trocar de sistema.','MANUAL PRÁTICO / '+label.upper())
 text(tag,14,'#6678b1',True)
 text('Este guia ajuda você a organizar um pequeno piloto e avaliar a rotina com dados do próprio negócio. Não exige abandonar seu sistema atual e não promete resultados financeiros.')
 for i,d in enumerate(decisions,1):block(f'0{i} / Decisão de operação',d)
 text('Objetivo do piloto: um profissional, um serviço e um agendamento real acompanhado até a conclusão.',11,'#5264b6',True)
 c.showPage()
 page(2,'Meça o que importa.','DIAGNÓSTICO / '+subtitle.upper())
 text('Antes de começar, registre uma semana de referência. Depois compare com um período semelhante. Mudanças de demanda, equipe e calendário afetam o resultado.')
 for t,b in [('Agendamentos concluídos','Conte os atendimentos efetivamente concluídos, separados de cancelamentos, faltas e reservas futuras.'),('Tempo para organizar a agenda','Anote quanto tempo a equipe leva para cadastrar ou localizar um horário. Compare o mesmo tipo de tarefa antes e durante o piloto.'),('Reagendamentos e faltas','Registre o motivo quando ele for informado. Evite atribuir toda melhora ou piora a uma ferramenta.'),('Clientes que voltam','Observe retornos ao longo do ciclo natural do seu serviço. Uma semana sem retorno não comprova perda de um cliente.'),('Recebimento e caixa','Agendamento e previsão de valor não são dinheiro recebido. Confira o atendimento e o recebimento antes de avaliar receita.')]:block(t,b)
 text('Sua decisão: que problema precisa melhorar para justificar uma assinatura? Escreva um critério concreto e avalie com sua equipe.',11,'#5264b6',True)
 c.showPage()
 page(3,'Textos que ajudam a rotina.','RELACIONAMENTO / MODELOS EDITÁVEIS')
 text('Adapte os campos entre colchetes. Envie pelos canais que seu negócio utiliza e respeite as preferências do cliente. Estes modelos não configuram disparos automáticos.')
 block('01 / Confirmação de atendimento',confirm)
 block('02 / Convite para retorno',rebook)
 block('03 / Mudança de horário','Olá, [nome]. Precisamos ajustar seu atendimento de [dia/hora]. Podemos oferecer [alternativa 1] ou [alternativa 2]. Qual funciona melhor para você?')
 block('04 / Como apresentar o link','Agora você também pode consultar serviços e horários por aqui: [link]. Se preferir falar com nossa equipe, continuamos disponíveis pelo canal habitual.')
 text('Boa comunicação resolve dúvidas, informa condições e oferece uma saída simples. Não prometa disponibilidade, preço ou entrega que a equipe não confirmou.',11,'#5264b6',True)
 c.showPage()
 page(4,'Seu piloto, em sete passos.','ATIVAÇÃO / ROTEIRO PARA AVALIAR')
 steps=[('Conheça a rotina','Abra a demonstração sem cadastro e simule um serviço e horário.'),('Escolha um profissional','Defina quem participará do piloto e revise a disponibilidade real.'),('Revise serviços','Ajuste preços e durações no modelo do seu segmento.'),('Traga uma parte da base','Use uma planilha CSV, confira a prévia e importe clientes do piloto.'),('Confira o link público','Teste os horários e compartilhe apenas quando estiver pronto.'),('Acompanhe o atendimento','Registre o primeiro agendamento e confira sua conclusão e caixa.'),('Decida com evidência','Compare o trabalho realizado com o problema definido na página 2.')]
 for i,(t,b) in enumerate(steps,1):block(f'{i:02d} / {t}',b)
 text('Experimente a AgendaAI por 30 dias, sem cartão e sem cobrança automática. A assinatura posterior é opcional; consulte os preços e condições no site.',10,'#5264b6',True)
 c.setFillColor(HexColor('#5264b6'));c.setFont('GuideBold',9);c.drawString(54,y,'agenda-ai-beryl.vercel.app/demonstracao');c.linkURL('https://agenda-ai-beryl.vercel.app/demonstracao?segmento='+('salao' if key=='beleza' else key),(54,y-3,450,y+13),relative=0)
 c.save();print(out.relative_to(BASE))
for key,data in specs.items():make(key,data)
