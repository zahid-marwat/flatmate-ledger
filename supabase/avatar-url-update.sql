-- Updates existing seeded users to use the real local avatar image files.

update public.users set avatar_url = '/avatars/asfandyar.jpg' where contact = 'asfandyar';
update public.users set avatar_url = '/avatars/zahid.jpg' where contact = 'zahid-admin';
update public.users set avatar_url = '/avatars/zahid.jpg' where contact = 'zahid';
update public.users set avatar_url = '/avatars/muavia.jpg' where contact = 'muavia';
update public.users set avatar_url = '/avatars/saad.jpg' where contact = 'saad';
update public.users set avatar_url = '/avatars/hassan.jpg' where contact = 'hassan';
update public.users set avatar_url = '/avatars/shami.jpg' where contact = 'shami';
update public.users set avatar_url = '/avatars/Faisal.jpg' where contact = 'faisal';
update public.users set avatar_url = '/avatars/maaz.jpg' where contact = 'maaz';
