Run these command in terminal

Step 1 : cd backend

Step 2 : set http_proxy=
Step 3 : set https_proxy=
Step 4 : set no_proxy=172.*;

Step 5 : python -m venv venv
Step 6 : .\venv\Scripts\activate 
Step 7 : pip install -r requirements.txt 
Step 8 : python manage.py migrate
Step 9 : python manage.py runserver
